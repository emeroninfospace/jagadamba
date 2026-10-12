### Jagadamba

Jagadamba

### Installation

You can install this app using the [bench](https://github.com/frappe/bench) CLI:

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/emeroninfospace/jagadamba.git --branch main
bench --site your-site.example.com install-app jagadamba
```

### Workspace upgrade

See [workspace upgrade notes](docs/workspace-upgrade.md) for department roles, dashboard semantics, compatibility changes, validation limits and staging instructions. ERPNext must be installed before this app; HRMS is needed for its existing Employee customizations and HR features.

### Contributing

This app uses `pre-commit` for code formatting and linting. Please [install pre-commit](https://pre-commit.com/#installation) and enable it for this repository:

```bash
cd apps/jagadamba
pre-commit install
```

Pre-commit is configured to use the following tools for checking and formatting your code:

- ruff
- eslint
- prettier
- pyupgrade

### CI

This app can use GitHub Actions for CI. The following workflows are configured:

- CI: Installs this app and runs unit tests on every push to `main` and on pull requests.
- Linters: Runs [Frappe Semgrep Rules](https://github.com/frappe/semgrep-rules) and [pip-audit](https://pypi.org/project/pip-audit/) on every pull request.


### License

mit
