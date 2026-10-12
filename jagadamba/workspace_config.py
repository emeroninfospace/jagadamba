"""Default workspace audiences, seeded into Workspaces and Jagadamba Workspace Profiles.

After installation the live audience is whatever is configured on each Workspace and
Jagadamba Workspace Profile record; this module only supplies first-install defaults.
Navigation roles never grant document permissions.
"""

MANAGERS = ("System Manager", "Management")
AUDIENCES = {
    "sales": ("Sales Executive", "Sales User", "Sales Manager"),
    "production": ("Production Engineer", "Manufacturing User", "Manufacturing Manager", "Quality Engineer"),
    "projects": ("Project Engineer", "Projects User", "Projects Manager", "Engineering Head"),
    "procurement": ("Procurement Engineer", "Purchase User", "Purchase Manager"),
    "stores": ("Stores User", "Stock User", "Stock Manager"),
    "design": ("Design Engineer", "Engineering Head"),
    "accounting": ("Finance Manager", "Accounts User", "Accounts Manager"),
    "hr": ("HR User", "HR Manager"),
    "quality": ("Quality Engineer", "Quality Manager"),
    "logistics": ("Delivery Manager", "Delivery User"),
    "maintenance": ("Maintenance Manager", "Maintenance User"),
    "overview": tuple(),
}
WORKSPACES = {
    "Jagadamba": "overview", "Sales Desk": "sales", "Sales Overview": "sales",
    "Production": "production", "Production Overview": "production",
    "Project Desk": "projects", "Project Overview": "projects",
    "Procurement Desk": "procurement", "Stores": "stores", "Design": "design",
    "Accounting Overview": "accounting", "HR Overview": "hr",
    "Quality Desk": "quality", "Logistics Desk": "logistics", "Maintenance Desk": "maintenance",
}


def roles_for(scope):
    if scope == "overview":
        return sorted(set(MANAGERS).union(*AUDIENCES.values()))
    return list(MANAGERS + AUDIENCES[scope])
