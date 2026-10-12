// Workspace → roles that can see it (case-insensitive workspace name match)
const WORKSPACE_ROLES = {
	"sales desk": ["Sales Executive"],
	"design": ["Design Engineer"],
	"project desk": ["Project Engineer"],
	"procurement desk": ["Procurement Engineer"],
	"stores": ["Stores User"],
	"quality": ["Quality Engineer"],
	"production": ["Production Engineer"],
};

const DEFAULT_WORKSPACE_BY_ROLE = [
	["Sales Executive", "Sales Desk"],
	["Design Engineer", "Design"],
	["Project Engineer", "Project Desk"],
	["Procurement Engineer", "Procurement Desk"],
	["Stores User", "Stores"],
	["Quality Engineer", "Quality"],
	["Production Engineer", "Production"],
];

const BYPASS_ROLES = ["System Manager", "Administrator", "Management"];
const BYPASS_USERS = ["Administrator"];

function user_bypasses() {
	if (BYPASS_USERS.includes(frappe.session.user)) return true;
	return BYPASS_ROLES.some(r => frappe.user.has_role(r));
}

function get_allowed_workspaces() {
	if (user_bypasses()) return null; 
	const allowed = new Set();
	for (const [ws, roles] of Object.entries(WORKSPACE_ROLES)) {
		if (roles.some(r => frappe.user.has_role(r))) allowed.add(ws);
	}
	return allowed;
}

function get_default_workspace() {
	if (user_bypasses()) return null;
	for (const [role, ws] of DEFAULT_WORKSPACE_BY_ROLE) {
		if (frappe.user.has_role(role)) return ws;
	}
	return null;
}

function is_workspace_allowed(name, allowed) {
	if (!allowed) return true;
	const label = (name || "").toLowerCase();

	return allowed.has(label);
}

(function patch_workspace_show_page() {
	if (!frappe.views || !frappe.views.Workspace) return;
	const _orig = frappe.views.Workspace.prototype.show_page;

	frappe.views.Workspace.prototype.show_page = async function (page) {
		const allowed = get_allowed_workspaces();
		const fallback = get_default_workspace();

		if (allowed && page && page.name && !is_workspace_allowed(page.name, allowed)) {
			if (fallback) page = { name: fallback, public: true };
		}

		if (page && this.all_pages && this.all_pages.length) {
			const pool = (page.public && this.public_pages && this.public_pages.length)
				? this.public_pages
				: (this.private_pages || []);
			const found = pool.some(p => p.title === page.name);
			if (!found) {
				const first = this.all_pages[0];
				page = { name: first.title, public: !!first.public };
			}
		}
		return _orig.call(this, page);
	};
})();

frappe.after_ajax(() => {
	function fix_default_workspace(fallback) {
		if (frappe.boot && frappe.boot.user) {
			frappe.boot.user.default_workspace = null;
		}
		if (fallback) {
			localStorage.current_page = fallback;
			localStorage.is_current_page_public = "true";
		}
	}

	function apply_sidebar_restrictions(allowed) {
		document.querySelectorAll(".sidebar-item-container").forEach(el => {
			const name = (el.getAttribute("item-name") || "").toLowerCase();
			const anchor = el.querySelector("a.item-anchor");
			const title = anchor ? (anchor.getAttribute("title") || "").toLowerCase() : "";
			const label = name || title;
			if (!label) return;
			if (!is_workspace_allowed(label, allowed)) {
				el.style.setProperty("display", "none", "important");
			}
		});
		document.querySelectorAll(".standard-sidebar-section").forEach(section => {
			const visible = Array.from(section.querySelectorAll(".sidebar-item-container"))
				.some(el => el.style.display !== "none");
			section.style.setProperty("display", visible ? "" : "none", "important");
		});
	}

	let _observer = null;
	function stop_observer() { if (_observer) { _observer.disconnect(); _observer = null; } }
	function start_observer(allowed) {
		stop_observer();
		const sidebar = document.querySelector(".desk-sidebar") || document.body;
		_observer = new MutationObserver(() => apply_sidebar_restrictions(allowed));
		_observer.observe(sidebar, { childList: true, subtree: true });
	}

	function schedule_restrict(delay) {
		const allowed = get_allowed_workspaces();
		if (!allowed) return;
		setTimeout(function attempt(retries) {
			const has_sidebar = document.querySelector(".sidebar-item-container");
			if (has_sidebar) {
				apply_sidebar_restrictions(allowed);
				start_observer(allowed);
			} else if (retries > 0) {
				setTimeout(() => attempt(retries - 1), 400);
			}
		}, delay, 15);
	}

	const allowed = get_allowed_workspaces();
	if (allowed) {
		fix_default_workspace(get_default_workspace());
	} else {
		localStorage.removeItem("current_page");
		localStorage.removeItem("is_current_page_public");
	}

	frappe.router.on("change", () => {
		stop_observer();
		schedule_restrict(300);
	});
	schedule_restrict(600);
});
