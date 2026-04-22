# Constraints

Universal hard rules. No exceptions.

## Branch Isolation

Git scope is the current branch and `develop`/`master` only.

**Forbidden:**

-   `git show <commit-from-other-branch>:path`
-   `git log --all` to find or read code from other branches
-   `git diff` against feature branches
-   Using commits reachable only from other branches

## Scope Discipline

-   **In scope:** Code directly related to the current task.
-   **Out of scope:** Existing code with no direct link. Report findings ("X has the same issue") but don't change it.
-   Branch context: `develop`/`main` = narrow scope. Feature branches = broader scope covering all branch changes.
