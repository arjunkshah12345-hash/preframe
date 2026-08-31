# @preframe/vite

Opt-in Vite transform for PreFrame. **Experimental.**

## Usage

```ts
import preframe from "@preframe/vite";

export default {
  plugins: [
    preframe({
      include: ["src/compute/**"],
    }),
  ],
};
```

Mark files explicitly:

```ts
/** @preframe */
export function crunch(data: number[]) {
  for (let i = 0; i < data.length; i++) {
    data[i] = transform(data[i]!);
  }
}
```

Only files matching `include` **and** carrying `@preframe` / `// @preframe` are transformed. Blind whole-app transforms are unsupported on purpose.

Prefer `@preframe/core`'s `run` / `cooperative` for production until this plugin is production-grade.

See the [main README](../../README.md) and [docs/GUIDE.md](../../docs/GUIDE.md).
