# Engineering

What makes code good. Principles over patterns.

## Code for the Reader

Every line answers: "Will someone understand this in 6 months?"

-   **Names reveal intent** — `getUserPermissions` not `fetchData`
-   **Structure mirrors the domain** — Organization reflects how humans think about the problem
-   **Extract for clarity, not reuse** — Complex logic gets its own function for naming and isolation, even if called once

## Anticipate Change Correctly

Code that's **easy to change**, not code that handles every future case.

**Wrong:** Config flags for hypothetical features, abstractions for one use case, "flexible" factories nobody asked for.

**Right:** Clear structure where it's obvious where to add things.

## Trust Boundaries

Validate at system edges only: user input, external API responses, file/database reads.

Internal functions trust their callers. Defensive checks on internal code hide bugs instead of exposing them.

## DRY Without Over-Abstraction

Duplicated logic is a dormant bug. Extract when logic is actually shared.

Extraction ≠ abstraction. Don't add indirection or generics when simple extraction suffices. Abstract only with 3+ concrete cases that genuinely vary.

## Delete Freely

No `// deprecated` comments, no backward-compat shims, no `_unused` variables. Git has history.

## Generalize Over Specialize

When writing a "special case" function, ask: could a general function handle all cases?

```typescript
// Specialized: two functions, same logic, one boolean apart
function enableDevice(device: IDevice): void {
    device.enabled = true;
    save(device);
}
function disableDevice(device: IDevice): void {
    device.enabled = false;
    save(device);
}

// General: one function handles both
function setDeviceEnabled(device: IDevice, enabled: boolean): void {
    device.enabled = enabled;
    save(device);
}
```

Generalization ≠ abstraction. A general function directly handles all cases. Abstraction still requires 3+ concrete cases.

## Consistency

Consistent at every level — within a function, file, module, and project. Inconsistency forces readers to ask "why is this different?" when there's no reason.

## Minimal Diff

Changes touch the least code possible. Smaller diffs = easier review, less risk.

When implementation cost is low, prefer consistent structural patterns even for passthrough cases — this minimizes future diff complexity.

```typescript
// No passthrough — adding Child2 logic later requires creating the class + updating references
const child2 = new Parent();

// Passthrough — adding Child2 logic later is a one-file diff
class Child2 extends Parent {}
const child2 = new Child2();
```

## Async Safety

Always ask: "Can state change between these operations?"

```typescript
// Unsafe: state can change between read and write
const count: number = await getCount(roomId);
await setCount(roomId, count + 1);

// Safe: atomic operation
await incrementCount(roomId);
```

## No Magic Numbers

Arbitrary numbers reveal incomplete understanding. If you can't derive a number from the system's behavior, you're masking a problem. Exception: 0, 1, -1.

## What NOT to Do

-   Don't add comments unilaterally. If logic needs explanation and refactoring would degrade quality, ask: refactor / comment / other.
