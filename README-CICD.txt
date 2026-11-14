# Smart Inventory - CI/CD setup

This patch adds GitHub Actions CI for the existing Phase 5/6/7 project without changing application source or database schema.

## What the workflow does

- Runs backend Maven tests using Java 21.
- Installs frontend dependencies and runs the TypeScript/Vite production build.
- Builds both Docker images after the test/build jobs pass.
- Runs on pushes and pull requests targeting `main` or `master`, and can be started manually.

The workflow does not push images to a registry and does not deploy anything. No cloud credentials or secrets are required for this CI stage.

## Apply

From the project root (`~/Downloads/smart-inventory`):

```bash
unzip -o ~/Downloads/phase8-cicd.zip -d .
```

Then check the files:

```bash
ls -la .github/workflows
cat .github/workflows/ci.yml
```

## Push to GitHub

If the project is not already a Git repository:

```bash
git init
git branch -M main
git add .
git commit -m "Add Smart Inventory CI pipeline"
```

Create an empty GitHub repository in your browser, then connect it using its actual URL:

```bash
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

If `origin` already exists, do not add it again. Check it with:

```bash
git remote -v
```

After pushing, open the repository on GitHub and select **Actions**. The workflow should run automatically.

## Notes

- The workflow uses `npm install` without npm caching because this project currently has no `frontend/package-lock.json`.
- Docker images are built for validation only. They are not published.
- The frontend Dockerfile currently runs the Vite development server. Before public production deployment, replace this with a production build served by a web server or static hosting.
- Do not commit `.env` files, passwords, tokens, database dumps, or personal data.
- Do not run `docker compose down -v`; this CI patch does not require touching your local database volume.
