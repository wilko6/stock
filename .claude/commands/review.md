# Review MR

Argument: branch name (e.g., IV-375 or feature/IV-375)

## Architecture

```
Coordinator
├── Fetch diff & commits
├── Extract intent (what problem does this solve?)
├── Spawn parallel review agents:
│   ├── Dev Expert (review mode): conventions, style, quality, integration
│   └── Engineer Expert (review mode): design, architecture, async safety, edge cases
├── Spawn parallel alternative agents:
│   ├── Engineer Expert (minimal lens): smallest diff approach
│   └── Engineer Expert (lateral lens): reframe the problem
└── Synthesize reports → final output
```

## Process

### 1. Fetch Context (coordinator)

```bash
git branch -a | grep -i "$BRANCH"
git diff develop...$BRANCH
git log develop..$BRANCH --oneline
```

### 2. Extract Intent (coordinator)

From commits and diff, identify:

-   **End-goal:** What user need does this address?
-   **Approach:** Brief description of the solution chosen

This intent is shared with all agents.

### 3. Spawn Review Agents (parallel)

Launch simultaneously:

**Dev Expert (review mode):**

> "Review this diff. Operate in Review Mode.
>
> Check against:
>
> -   engineering.md principles (trust boundaries, DRY, consistency, minimal diff)
> -   Naming, typing, structure, complexity, codebase idioms
> -   Async safety, no magic numbers, integration completeness
> -   Sibling consistency — does the code follow established patterns?
>
> Use the standard Review Mode output format (Critical / Warning / Note).
> Be terse. Empty categories are fine."

**Engineer Expert (review mode):**

> "Evaluate this implementation against design and architecture. Operate in Review Mode.
>
> Check:
>
> -   Does the implementation match the design intent?
> -   Are architectural boundaries respected (Binding vs Model vs Route)?
> -   Is the data flow sound (EventBus emissions, state propagation)?
> -   Async safety: can state change between operations?
> -   Edge cases: error paths, disconnection, concurrent updates
> -   Integration surface: all registration points covered?
>
> Report discrepancies with file:line references."

### 4. Spawn Alternative Agents (parallel)

Launch simultaneously:

**Engineer Expert (minimal lens):**

> "Given this end-goal: [problem statement]
>
> Design a solution optimizing for minimal lens — smallest diff, fewest touched files, least new code.
> Don't anchor to the existing solution. Note trade-offs against other dimensions.
> Be terse — table format preferred."

**Engineer Expert (lateral lens):**

> "Given this end-goal: [problem statement]
>
> Design a solution optimizing for lateral lens — challenge whether the problem is where we think.
> Reframe the problem. Consider fundamentally different approaches.
> Be terse — table format preferred."

### 5. Synthesize (coordinator)

Compile agent reports into final output:

-   **Review convergence:** Where Dev and Engineer reviewers independently flag the same issue = high confidence finding
-   **Review divergence:** Issues flagged by only one reviewer = include with source attribution
-   **Alternative convergence:** Where alternative agents agree = obvious best path
-   **Alternative divergence:** Where they disagree = genuine trade-offs
-   **Comparison:** How current implementation compares to suggested alternatives

The more conservative review assessment wins (any "Request Changes" requires action).

## Output Format

```markdown
## MR Review: [branch]

### Summary

[One sentence: what this MR does]

### Critical Issues

-   [ ] Issue: description + file:line

(Empty if none)

### Warnings

-   [ ] Warning: description + file:line

(Empty if none)

### Notes

-   Observation or minor suggestion

(Empty if none)

### Alternative Analysis

**End-goal:** [problem statement]

**Current approach:** [brief description]

| Approach | Trade-off | vs Current         |
| -------- | --------- | ------------------ |
| Alt A    | ...       | Current is simpler |
| Alt B    | ...       | Worth discussing   |

[Only if genuinely useful alternatives emerged. Don't manufacture.]

### Verdict: [APPROVE / REQUEST CHANGES / DISCUSS]
```
