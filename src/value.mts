import { type GCMarker, surroundingAgent } from './host-defined/engine.mts';
import {
  Q, X, type ValueEvaluator, type PlainCompletion,
} from './completion.mts';
import {
  PropertyKeyMap, OutOfRange, callable,
} from './helpers.mts';
import type { PrivateElementRecord } from './runtime-semantics/MethodDefinitionEvaluation.mts';
import type { PlainEvaluator } from './evaluator.mts';
import { TraceRecord } from './trace.mts';
import { OperationHandle } from './trace-builder.mts';
import {
  Assert,
  OrdinaryDefineOwnProperty,
  OrdinaryDelete,
  OrdinaryGet,
  OrdinaryGetOwnProperty,
  OrdinaryGetPrototypeOf,
  OrdinaryHasProperty,
  OrdinaryIsExtensible,
  OrdinaryOwnPropertyKeys,
  OrdinaryPreventExtensions,
  OrdinarySet,
  OrdinarySetPrototypeOf,
  ToInt32,
  ToUint32,
  Z,
  F, R, type OrdinaryObject, type FunctionObject,
  type BuiltinFunctionObject,
  type ECMAScriptFunctionObject,
  type DefaultConstructorBuiltinFunction, EnvironmentRecord,
  Throw,
} from '#self';

let createStringValue: (value: string) => JSStringValue; // set by static block in StringValue for privileged access to constructor
let createNumberValue: (value: number) => NumberValue; // set by static block in NumberValue for privileged access to constructor
let createBigIntValue: (value: bigint) => BigIntValue; // set by static block in BigIntValue for privileged access to constructor

abstract class BaseValue {
  trace: TraceRecord = new TraceRecord();

  static declare readonly null: NullValue; // defined in static block of NullValue

  static declare readonly undefined: UndefinedValue; // defined in static block of UndefinedValue

  static declare readonly true: BooleanValue<true>; // defined in static block of BooleanValue

  static declare readonly false: BooleanValue<false>; // defined in static block of BooleanValue

  abstract type: Value['type']; // ensures new `Value` subtypes must be added to `Value` union

  declare static [Symbol.hasInstance]: (value: unknown) => value is Value; // no need to actually declare it.
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types */
export type Value =
  | UndefinedValue
  | NullValue
  | BooleanValue
  | JSStringValue
  | SymbolValue
  | NumberValue
  | BigIntValue
  | ObjectValue;

/** https://tc39.es/ecma262/#sec-ecmascript-language-types */
export const Value = (() => {
  // NOTE: Using IIFE so that the class does not conflict with the type of the same name
  @callable((_target, _thisArg, [value]) => {
    if (value === null) {
      return Value.null;
    } else if (value === undefined) {
      return Value.undefined;
    } else if (value === true) {
      return Value.true;
    } else if (value === false) {
      return Value.false;
    }
    switch (typeof value) {
      case 'string':
        return createStringValue(value);
      case 'number':
        return createNumberValue(value);
      case 'bigint':
        return createBigIntValue(value);
      default:
        throw new OutOfRange('new Value', value);
    }
  })
  abstract class Value extends BaseValue {
  }
  return Value;
})() as typeof BaseValue & {
  <T extends null | undefined | boolean | string | number | bigint>(value: T):
    T extends null ? NullValue :
    T extends undefined ? UndefinedValue :
    T extends boolean ? BooleanValue<T> :
    T extends string ? JSStringValue :
    T extends number ? NumberValue :
    T extends bigint ? BigIntValue :
    never;
};

/** https://tc39.es/ecma262/#sec-ecmascript-language-types */
export type PropertyKeyValue =
  | JSStringValue
  | SymbolValue;

/** https://tc39.es/ecma262/#sec-ecmascript-language-types */
export type PrimitiveValue =
  | UndefinedValue
  | NullValue
  | BooleanValue
  | JSStringValue
  | SymbolValue
  | NumberValue
  | BigIntValue;

/** https://tc39.es/ecma262/#sec-ecmascript-language-types */
export const PrimitiveValue = (() => {
  type PrimValue = PrimitiveValue;
  return (() => {
    // NOTE: Using nested IIFE so that the class does not conflict with the type of the same name
    // NOTE: Only using IIFE because TypeScript errors when `abstract` is used on class expressions
    abstract class PrimitiveValue extends Value {
      declare static [Symbol.hasInstance]: (value: unknown) => value is PrimValue;
    }
    return PrimitiveValue;
  })();
})();

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-undefined-type */
export class UndefinedValue extends PrimitiveValue {
  declare readonly type: 'Undefined'; // defined on prototype by static block

  declare readonly value: undefined; // defined on prototype by static block

  private constructor() { // eslint-disable-line no-useless-constructor -- Sets privacy for constructor
    super();
  }

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'Undefined' });
    Object.defineProperty(this.prototype, 'value', { value: undefined });
    Object.defineProperty(Value, 'undefined', { value: new this() });
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is UndefinedValue;
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-null-type */
export class NullValue extends PrimitiveValue {
  declare readonly type: 'Null'; // defined on prototype by static block

  declare readonly value: null; // defined on prototype by static block

  private constructor() { // eslint-disable-line no-useless-constructor -- Sets privacy for constructor
    super();
  }

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'Null' });
    Object.defineProperty(this.prototype, 'value', { value: null });
    Object.defineProperty(Value, 'null', { value: new this() });
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is NullValue;
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-boolean-type */
export class BooleanValue<T extends boolean = boolean> extends PrimitiveValue {
  declare readonly type: 'Boolean'; // defined on prototype by static block

  readonly value: T;

  private constructor(value: T) {
    super();
    this.value = value;
  }

  booleanValue() {
    return this.value;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `Boolean { ${this.value} }`;
  }

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'Boolean' });
    Object.defineProperty(Value, 'true', { value: new this(true) });
    Object.defineProperty(Value, 'false', { value: new this(false) });
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is BooleanValue;
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-string-type */
export class JSStringValue extends PrimitiveValue {
  declare readonly type: 'String'; // defined on prototype by static block

  readonly value: string;

  private constructor(value: string) {
    super();
    this.value = value;
  }

  stringValue() {
    return this.value;
  }

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'String' });
    createStringValue = (value) => new this(value);
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is JSStringValue;
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-symbol-type */
export class SymbolValue extends PrimitiveValue {
  declare readonly type: 'Symbol'; // defined on prototype by static block

  readonly Description: JSStringValue | UndefinedValue;

  constructor(Description: JSStringValue | UndefinedValue) {
    super();
    this.Description = Description;
  }

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'Symbol' });
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is SymbolValue;
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-symbol-type */
export const wellKnownSymbols = {
  asyncIterator: new SymbolValue(Value('Symbol.asyncIterator')),
  hasInstance: new SymbolValue(Value('Symbol.hasInstance')),
  isConcatSpreadable: new SymbolValue(Value('Symbol.isConcatSpreadable')),
  iterator: new SymbolValue(Value('Symbol.iterator')),
  match: new SymbolValue(Value('Symbol.match')),
  matchAll: new SymbolValue(Value('Symbol.matchAll')),
  replace: new SymbolValue(Value('Symbol.replace')),
  search: new SymbolValue(Value('Symbol.search')),
  species: new SymbolValue(Value('Symbol.species')),
  split: new SymbolValue(Value('Symbol.split')),
  toPrimitive: new SymbolValue(Value('Symbol.toPrimitive')),
  toStringTag: new SymbolValue(Value('Symbol.toStringTag')),
  unscopables: new SymbolValue(Value('Symbol.unscopables')),
} as const;
Object.setPrototypeOf(wellKnownSymbols, null);
Object.freeze(wellKnownSymbols);

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-number-type */
export class NumberValue extends PrimitiveValue {
  declare readonly type: 'Number'; // defined on prototype by static block

  readonly value: number;

  private constructor(value: number) {
    super();
    this.value = value;
  }

  numberValue() {
    return this.value;
  }

  isNaN() {
    return Number.isNaN(this.value);
  }

  isInfinity() {
    return !Number.isFinite(this.value) && !this.isNaN();
  }

  isFinite() {
    return Number.isFinite(this.value);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-unaryMinus */
  static unaryMinus(x: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::unaryMinus', x, [OperationHandle.formatValue(x)])
      : null;
    // 1. If x is NaN, return NaN.
    if (x.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 1: x is NaN → return NaN.' });
      const r = F(NaN);
      op?.log({ kind: 'return', hint: 'Step 1: return NaN.' }, r);
      return r;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 1: x is not NaN — continue.' });
    // 2. Return the result of negating x; that is, compute a Number with the same magnitude but opposite sign.
    const r = F(-R(x));
    op?.log({ kind: 'return', hint: 'Step 2: return the result of negating x (same magnitude, opposite sign).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-bitwiseNOT */
  static bitwiseNOT(x: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::bitwiseNOT', x, [OperationHandle.formatValue(x)])
      : null;
    // 1. Let oldValue be ! ToInt32(x).
    op?.log({ kind: 'call', hint: 'Step 1: Let oldValue be ! ToInt32(x).' });
    const oldValue = X(ToInt32(x));
    // 2. Return the result of applying bitwise complement to oldValue. The result is a signed 32-bit integer.
    const r = F(~R(oldValue));
    op?.log({ kind: 'return', hint: 'Step 2: return bitwise complement of oldValue (signed 32-bit integer).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-exponentiate */
  static exponentiate(base: NumberValue, exponent: NumberValue) {
    const op = base.trace.hasActiveOperation()
      ? OperationHandle.begin(base.trace, 'Number::exponentiate', base, [OperationHandle.formatValue(base), OperationHandle.formatValue(exponent)])
      : null;
    if (op) {
      const b = R(base);
      const e = R(exponent);
      const absB = Math.abs(b);
      const isOddIntegral = (n: number) => Number.isFinite(n) && Math.floor(n) === n && (Math.abs(n) % 2 === 1);
      // 1. If exponent is NaN, return NaN.
      const s1 = exponent.isNaN();
      op.log({ kind: 'if', taken: s1, hint: s1 ? 'Step 1: exponent is NaN → return NaN.' : 'Step 1: exponent is not NaN — continue.' });
      if (!s1) {
        // 2. If exponent is +0𝔽 or exponent is -0𝔽, return 1𝔽.
        const s2 = e === 0;
        op.log({ kind: 'if', taken: s2, hint: s2 ? 'Step 2: exponent is ±0 → return 1.' : 'Step 2: exponent is not ±0 — continue.', description: s2 ? 'Anything raised to the zero power is 1.' : undefined });
        if (!s2) {
          // 3. If base is NaN, return NaN.
          const s3 = base.isNaN();
          op.log({ kind: 'if', taken: s3, hint: s3 ? 'Step 3: base is NaN → return NaN.' : 'Step 3: base is not NaN — continue.' });
          if (!s3) {
            // 4. If base is +∞𝔽, then a. If exponent > +0𝔽, return +∞; otherwise +0.
            const s4 = b === +Infinity;
            op.log({ kind: 'if', taken: s4, hint: s4 ? `Step 4: base is +∞ → ${e > 0 ? 'exponent > 0 → return +∞' : 'exponent < 0 → return +0'}.` : 'Step 4: base is not +∞ — continue.' });
            if (!s4) {
              // 5. If base is -∞𝔽, then a/b. odd integral exponent vs non-odd-integral.
              const s5 = b === -Infinity;
              op.log({ kind: 'if', taken: s5, hint: s5 ? `Step 5: base is -∞ → ${isOddIntegral(e) ? 'odd integral exponent' : 'non-odd-integral exponent'}, ${e > 0 ? 'exponent > 0' : 'exponent < 0'}.` : 'Step 5: base is not -∞ — continue.' });
              if (!s5) {
                // 6. If base is +0𝔽, then a. exponent>0 → +0; otherwise +∞.
                const s6 = Object.is(b, +0);
                op.log({ kind: 'if', taken: s6, hint: s6 ? `Step 6: base is +0 → ${e > 0 ? 'exponent > 0 → return +0' : 'exponent < 0 → return +∞'}.` : 'Step 6: base is not +0 — continue.' });
                if (!s6) {
                  // 7. If base is -0𝔽, then a/b. odd integral exponent vs non-odd-integral.
                  const s7 = Object.is(b, -0);
                  op.log({ kind: 'if', taken: s7, hint: s7 ? `Step 7: base is -0 → ${isOddIntegral(e) ? 'odd integral exponent' : 'non-odd-integral exponent'}, ${e > 0 ? 'exponent > 0' : 'exponent < 0'}.` : 'Step 7: base is not -0 — continue.' });
                  if (!s7) {
                    // 8. Assert: base is finite and nonzero.
                    op.log({ kind: 'operation', hint: 'Step 8: assert base is finite and nonzero.' });
                    // 9. If exponent is +∞𝔽, then a/b/c. |base| > 1 → +∞; = 1 → NaN; < 1 → +0.
                    const s9 = e === +Infinity;
                    op.log({ kind: 'if', taken: s9, hint: s9 ? `Step 9: exponent is +∞ → |base| ${absB > 1 ? '> 1 → return +∞' : absB === 1 ? '= 1 → return NaN' : '< 1 → return +0'}.` : 'Step 9: exponent is not +∞ — continue.' });
                    if (!s9) {
                      // 10. If exponent is -∞𝔽, then a/b/c. |base| > 1 → +0; = 1 → NaN; < 1 → +∞.
                      const s10 = e === -Infinity;
                      op.log({ kind: 'if', taken: s10, hint: s10 ? `Step 10: exponent is -∞ → |base| ${absB > 1 ? '> 1 → return +0' : absB === 1 ? '= 1 → return NaN' : '< 1 → return +∞'}.` : 'Step 10: exponent is not -∞ — continue.' });
                      if (!s10) {
                        // 11. Assert: exponent is finite and nonzero.
                        op.log({ kind: 'operation', hint: 'Step 11: assert exponent is finite and nonzero.' });
                        // 12. If base < -0𝔽 and exponent is not an integral Number, return NaN.
                        const s12 = b < 0 && !(Number.isFinite(e) && Math.floor(e) === e);
                        op.log({ kind: 'if', taken: s12, hint: s12 ? 'Step 12: base < 0 and exponent is not integral → return NaN.' : 'Step 12: not (base < 0 and non-integral exponent) — continue.', description: s12 ? 'Real-valued power of a negative base requires an integer exponent.' : undefined });
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    // 13. Return an implementation-approximated Number value representing ℝ(base) ** ℝ(exponent).
    const r = F(R(base) ** R(exponent));
    op?.log({ kind: 'return', hint: 'Return: F(R(base) ** R(exponent)).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-multiply */
  static multiply(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::multiply', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    if (op) {
      const xVal = R(x);
      const yVal = R(y);
      // 1. If x is NaN or y is NaN, return NaN.
      const s1 = x.isNaN() || y.isNaN();
      op.log({ kind: 'if', taken: s1, hint: s1 ? 'Step 1: x or y is NaN → return NaN.' : 'Step 1: neither x nor y is NaN — continue.' });
      if (!s1) {
        // 2. If x is ±∞: a. y is ±0 → NaN; b. y > 0 → x; c. y < 0 → -x.
        const s2 = x.isInfinity();
        op.log({ kind: 'if', taken: s2, hint: s2 ? `Step 2: x is ±∞ → ${yVal === 0 ? '2a: y is ±0 → return NaN' : yVal > 0 ? '2b: y > 0 → return x' : '2c: y < 0 → return -x'}.` : 'Step 2: x is finite — continue.' });
        if (!s2) {
          // 3. If y is ±∞: a. x is ±0 → NaN; b. x > 0 → y; c. x < 0 → -y.
          const s3 = y.isInfinity();
          op.log({ kind: 'if', taken: s3, hint: s3 ? `Step 3: y is ±∞ → ${xVal === 0 ? '3a: x is ±0 → return NaN' : xVal > 0 ? '3b: x > 0 → return y' : '3c: x < 0 → return -y'}.` : 'Step 3: y is finite — continue.' });
        }
      }
    }
    // 4. Return 𝔽(ℝ(x) × ℝ(y)).
    const r = F(R(x) * R(y));
    op?.log({ kind: 'return', hint: 'Step 4: return F(R(x) * R(y)).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-divide */
  static divide(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::divide', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    if (op) {
      const xVal = R(x);
      const yVal = R(y);
      // 1. If x is NaN or y is NaN, return NaN.
      const s1 = x.isNaN() || y.isNaN();
      op.log({ kind: 'if', taken: s1, hint: s1 ? 'Step 1: x or y is NaN → return NaN.' : 'Step 1: neither x nor y is NaN — continue.' });
      if (!s1) {
        // 2. If x is ±∞: a. y is ±∞ → NaN; b. y ≥ +0 → x; c. y < 0 → -x.
        const s2 = x.isInfinity();
        op.log({ kind: 'if', taken: s2, hint: s2 ? `Step 2: x is ±∞ → ${y.isInfinity() ? '2a: y is ±∞ → return NaN' : yVal >= 0 ? '2b: y ≥ +0 → return x' : '2c: y < 0 → return -x'}.` : 'Step 2: x is finite — continue.' });
        if (!s2) {
          // 3. If y is +∞: a. x ≥ +0 → +0; otherwise -0.
          const s3 = yVal === +Infinity;
          op.log({ kind: 'if', taken: s3, hint: s3 ? `Step 3: y is +∞ → ${xVal >= 0 && !Object.is(xVal, -0) ? 'x ≥ +0 → return +0' : 'x < 0 (or -0) → return -0'}.` : 'Step 3: y is not +∞ — continue.' });
          if (!s3) {
            // 4. If y is -∞: a. x ≥ +0 → -0; otherwise +0.
            const s4 = yVal === -Infinity;
            op.log({ kind: 'if', taken: s4, hint: s4 ? `Step 4: y is -∞ → ${xVal >= 0 && !Object.is(xVal, -0) ? 'x ≥ +0 → return -0' : 'x < 0 (or -0) → return +0'}.` : 'Step 4: y is not -∞ — continue.' });
            if (!s4) {
              // 5. If x is ±0: a. y is ±0 → NaN; b. y > 0 → x; c. y < 0 → -x.
              const s5 = xVal === 0;
              op.log({ kind: 'if', taken: s5, hint: s5 ? `Step 5: x is ±0 → ${yVal === 0 ? '5a: y is ±0 → return NaN' : yVal > 0 ? '5b: y > 0 → return x' : '5c: y < 0 → return -x'}.` : 'Step 5: x is not ±0 — continue.' });
              if (!s5) {
                // 6. If y is +0: a. x > 0 → +∞; otherwise -∞.
                const s6 = Object.is(yVal, +0);
                op.log({ kind: 'if', taken: s6, hint: s6 ? `Step 6: y is +0 → ${xVal > 0 ? 'x > 0 → return +∞' : 'x < 0 → return -∞'}.` : 'Step 6: y is not +0 — continue.' });
                if (!s6) {
                  // 7. If y is -0: a. x > 0 → -∞; otherwise +∞.
                  const s7 = Object.is(yVal, -0);
                  op.log({ kind: 'if', taken: s7, hint: s7 ? `Step 7: y is -0 → ${xVal > 0 ? 'x > 0 → return -∞' : 'x < 0 → return +∞'}.` : 'Step 7: y is not -0 — continue.' });
                }
              }
            }
          }
        }
      }
    }
    // 8. Return 𝔽(ℝ(x) / ℝ(y)).
    const r = F(R(x) / R(y));
    op?.log({ kind: 'return', hint: 'Step 8: return F(R(x) / R(y)).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-remainder */
  static remainder(n: NumberValue, d: NumberValue) {
    const op = n.trace.hasActiveOperation()
      ? OperationHandle.begin(n.trace, 'Number::remainder', n, [OperationHandle.formatValue(n), OperationHandle.formatValue(d)])
      : null;
    if (op) {
      const nVal = R(n);
      const dVal = R(d);
      // 1. If n is NaN or d is NaN, return NaN.
      const s1 = n.isNaN() || d.isNaN();
      op.log({ kind: 'if', taken: s1, hint: s1 ? 'Step 1: n or d is NaN → return NaN.' : 'Step 1: neither n nor d is NaN — continue.' });
      if (!s1) {
        // 2. If n is +∞𝔽 or n is -∞𝔽, return NaN.
        const s2 = n.isInfinity();
        op.log({ kind: 'if', taken: s2, hint: s2 ? 'Step 2: n is ±∞ → return NaN.' : 'Step 2: n is finite — continue.', description: s2 ? 'Infinity has no defined remainder.' : undefined });
        if (!s2) {
          // 3. If d is +∞𝔽 or d is -∞𝔽, return n.
          const s3 = d.isInfinity();
          op.log({ kind: 'if', taken: s3, hint: s3 ? 'Step 3: d is ±∞ → return n.' : 'Step 3: d is finite — continue.', description: s3 ? 'Any finite n is its own remainder modulo ∞.' : undefined });
          if (!s3) {
            // 4. If d is +0𝔽 or d is -0𝔽, return NaN.
            const s4 = dVal === 0;
            op.log({ kind: 'if', taken: s4, hint: s4 ? 'Step 4: d is ±0 → return NaN (division by zero).' : 'Step 4: d is nonzero — continue.' });
            if (!s4) {
              // 5. If n is +0𝔽 or n is -0𝔽, return n.
              const s5 = nVal === 0;
              op.log({ kind: 'if', taken: s5, hint: s5 ? 'Step 5: n is ±0 → return n.' : 'Step 5: n is nonzero — continue.' });
              if (!s5) {
                // 6. Assert: n and d are finite and nonzero.
                op.log({ kind: 'operation', hint: 'Step 6: assert n and d are finite and nonzero.' });
                // 7-11. Compute r = n - d × truncate(n / d).
                op.log({ kind: 'operation', hint: 'Steps 7–11: r = 𝔽(ℝ(n) − ℝ(d) × truncate(ℝ(n) / ℝ(d))).' });
              }
            }
          }
        }
      }
    }
    const r = F(R(n) % R(d));
    op?.log({ kind: 'return', hint: 'Return: F(R(n) % R(d)).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-add */
  static add(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::add', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    if (op) {
      const xVal = R(x);
      const yVal = R(y);
      // 1. If x is NaN or y is NaN, return NaN.
      const s1 = x.isNaN() || y.isNaN();
      op.log({ kind: 'if', taken: s1, hint: s1 ? 'Step 1: x or y is NaN → return NaN.' : 'Step 1: neither x nor y is NaN — continue.' });
      if (!s1) {
        // 2. If x is +∞ and y is -∞ → NaN.
        const s2 = xVal === +Infinity && yVal === -Infinity;
        op.log({ kind: 'if', taken: s2, hint: s2 ? 'Step 2: x is +∞ and y is -∞ → return NaN.' : 'Step 2: not (x = +∞ and y = -∞) — continue.', description: s2 ? '+∞ + -∞ is indeterminate.' : undefined });
        if (!s2) {
          // 3. If x is -∞ and y is +∞ → NaN.
          const s3 = xVal === -Infinity && yVal === +Infinity;
          op.log({ kind: 'if', taken: s3, hint: s3 ? 'Step 3: x is -∞ and y is +∞ → return NaN.' : 'Step 3: not (x = -∞ and y = +∞) — continue.' });
          if (!s3) {
            // 4. If x is ±∞ → x.
            const s4 = x.isInfinity();
            op.log({ kind: 'if', taken: s4, hint: s4 ? 'Step 4: x is ±∞ → return x.' : 'Step 4: x is finite — continue.' });
            if (!s4) {
              // 5. If y is ±∞ → y.
              const s5 = y.isInfinity();
              op.log({ kind: 'if', taken: s5, hint: s5 ? 'Step 5: y is ±∞ → return y.' : 'Step 5: y is finite — continue.' });
              if (!s5) {
                // 6. Assert: x and y both finite.
                op.log({ kind: 'operation', hint: 'Step 6: assert x and y are both finite.' });
                // 7. If x is -0 and y is -0 → -0.
                const s7 = Object.is(xVal, -0) && Object.is(yVal, -0);
                op.log({ kind: 'if', taken: s7, hint: s7 ? 'Step 7: x is -0 and y is -0 → return -0.' : 'Step 7: not (x = -0 and y = -0) — continue.', description: s7 ? 'Only sum of two -0s preserves the negative sign of zero under IEEE 754.' : undefined });
              }
            }
          }
        }
      }
    }
    // 8. Return 𝔽(ℝ(x) + ℝ(y)).
    const r = F(R(x) + R(y));
    op?.log({ kind: 'return', hint: 'Step 8: return F(R(x) + R(y)).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-subtract */
  static subtract(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::subtract', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // The result of - operator is x + (-y).
    op?.log({ kind: 'call', hint: 'Step 1: Return Number::add(x, F(-R(y))).' });
    const r = NumberValue.add(x, F(-R(y)));
    op?.log({ kind: 'return', hint: 'Step 1: return result of Number::add.' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-leftShift */
  static leftShift(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::leftShift', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. Let lnum be ! ToInt32(x).
    op?.log({ kind: 'call', hint: 'Step 1: Let lnum be ! ToInt32(x).' });
    const lnum = X(ToInt32(x));
    // 2. Let rnum be ! ToUint32(y).
    op?.log({ kind: 'call', hint: 'Step 2: Let rnum be ! ToUint32(y).' });
    const rnum = X(ToUint32(y));
    // 3. Let shiftCount be the result of masking out all but the least significant 5 bits of rnum, that is, compute rnum & 0x1F.
    const shiftCount = R(rnum) & 0x1F; // eslint-disable-line no-bitwise
    op?.log({ kind: 'operation', hint: `Step 3: shiftCount = rnum & 0x1F = ${shiftCount}.` });
    // 4. Return the result of left shifting lnum by shiftCount bits. The result is a signed 32-bit integer.
    const r = F(R(lnum) << shiftCount); // eslint-disable-line no-bitwise
    op?.log({ kind: 'return', hint: 'Step 4: return lnum left-shifted by shiftCount bits (signed 32-bit).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-signedRightShift */
  static signedRightShift(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::signedRightShift', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. Let lnum be ! ToInt32(x).
    op?.log({ kind: 'call', hint: 'Step 1: Let lnum be ! ToInt32(x).' });
    const lnum = X(ToInt32(x));
    // 2. Let rnum be ! ToUint32(y).
    op?.log({ kind: 'call', hint: 'Step 2: Let rnum be ! ToUint32(y).' });
    const rnum = X(ToUint32(y));
    // 3. Let shiftCount be the result of masking out all but the least significant 5 bits of rnum, that is, compute rnum & 0x1F.
    const shiftCount = R(rnum) & 0x1F; // eslint-disable-line no-bitwise
    op?.log({ kind: 'operation', hint: `Step 3: shiftCount = rnum & 0x1F = ${shiftCount}.` });
    // 4. Return the result of performing a sign-extending right shift of lnum by shiftCount bits.
    const r = F(R(lnum) >> shiftCount); // eslint-disable-line no-bitwise
    op?.log({ kind: 'return', hint: 'Step 4: return lnum sign-extended right-shifted by shiftCount bits.' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-unsignedRightShift */
  static unsignedRightShift(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::unsignedRightShift', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. Let lnum be ! ToInt32(x).
    op?.log({ kind: 'call', hint: 'Step 1: Let lnum be ! ToInt32(x).' });
    const lnum = X(ToInt32(x));
    // 2. Let rnum be ! ToUint32(y).
    op?.log({ kind: 'call', hint: 'Step 2: Let rnum be ! ToUint32(y).' });
    const rnum = X(ToUint32(y));
    // 3. Let shiftCount be the result of masking out all but the least significant 5 bits of rnum, that is, compute rnum & 0x1F.
    const shiftCount = R(rnum) & 0x1F; // eslint-disable-line no-bitwise
    op?.log({ kind: 'operation', hint: `Step 3: shiftCount = rnum & 0x1F = ${shiftCount}.` });
    // 4. Return the result of performing a zero-filling right shift of lnum by shiftCount bits.
    const r = F(R(lnum) >>> shiftCount); // eslint-disable-line no-bitwise
    op?.log({ kind: 'return', hint: 'Step 4: return lnum zero-filling right-shifted by shiftCount bits (unsigned 32-bit).' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-lessThan */
  static lessThan(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::lessThan', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    const xVal = R(x);
    const yVal = R(y);
    // 1. If x is NaN, return undefined.
    if (x.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 1: x is NaN → return undefined.', description: 'Comparisons with NaN are unordered; < then yields false.' });
      op?.log({ kind: 'return', hint: 'Step 1: return undefined.' }, Value.undefined);
      return Value.undefined;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 1: x is not NaN — continue.' });
    // 2. If y is NaN, return undefined.
    if (y.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 2: y is NaN → return undefined.', description: 'Comparisons with NaN are unordered.' });
      op?.log({ kind: 'return', hint: 'Step 2: return undefined.' }, Value.undefined);
      return Value.undefined;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 2: y is not NaN — continue.' });
    // 3. If x and y are the same Number value, return false.
    // 4. If x is +0𝔽 and y is -0𝔽, return false.
    // 5. If x is -0𝔽 and y is +0𝔽, return false.
    // (This engine folds spec steps 3–5 into a single === check: +0 === -0 is true.)
    if (xVal === yVal) {
      op?.log({ kind: 'if', taken: true, hint: 'Steps 3–5: x and y are the same Number value (or are +0/-0) → return false.' });
      op?.log({ kind: 'return', hint: 'Steps 3–5: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Steps 3–5: x and y are not equal Number values — continue.' });
    // 6. If x is +∞𝔽, return false.
    if (xVal === +Infinity) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 6: x is +∞ → return false.', description: 'Nothing is greater than +∞, so +∞ < y is always false.' });
      op?.log({ kind: 'return', hint: 'Step 6: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 6: x is not +∞ — continue.' });
    // 7. If y is +∞𝔽, return true.
    if (yVal === +Infinity) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 7: y is +∞ → return true.', description: 'Every finite x (and -∞) is less than +∞.' });
      op?.log({ kind: 'return', hint: 'Step 7: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 7: y is not +∞ — continue.' });
    // 8. If y is -∞𝔽, return false.
    if (yVal === -Infinity) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 8: y is -∞ → return false.', description: 'Nothing is less than -∞.' });
      op?.log({ kind: 'return', hint: 'Step 8: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 8: y is not -∞ — continue.' });
    // 9. If x is -∞𝔽, return true.
    if (xVal === -Infinity) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 9: x is -∞ → return true.', description: '-∞ is less than every finite y (and +∞).' });
      op?.log({ kind: 'return', hint: 'Step 9: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 9: x is not -∞ — continue.' });
    // 10. If ℝ(x) < ℝ(y), return true. Otherwise, return false.
    const lt = xVal < yVal;
    op?.log({ kind: 'return', hint: `Step 10: ℝ(x) < ℝ(y) is ${lt ? 'true' : 'false'} → return ${lt ? 'true' : 'false'}.`, description: 'Both finite — compare mathematical values.' }, lt ? Value.true : Value.false);
    return lt ? Value.true : Value.false;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-equal */
  static equal(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::equal', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. If x is NaN, return false.
    if (x.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 1: x is NaN → return false.', description: 'NaN is not equal to anything, including itself.' });
      op?.log({ kind: 'return', hint: 'Step 1: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 1: x is not NaN — continue.' });
    // 2. If y is NaN, return false.
    if (y.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 2: y is NaN → return false.', description: 'NaN is not equal to anything, including itself.' });
      op?.log({ kind: 'return', hint: 'Step 2: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 2: y is not NaN — continue.' });
    const xVal = R(x);
    const yVal = R(y);
    // 3. If x is the same Number value as y, return true.
    if (xVal === yVal) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 3: x is the same Number value as y → return true.', description: 'Exact equality (note: this engine folds +0/-0 here via ===, returning true before steps 4–5).' });
      op?.log({ kind: 'return', hint: 'Step 3: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 3: x is not the same Number value as y — continue.' });
    // 4. If x is +0𝔽 and y is -0𝔽, return true.
    if (Object.is(xVal, 0) && Object.is(yVal, -0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 4: x is +0 and y is -0 → return true.', description: '+0 and -0 compare equal under ==/===.' });
      op?.log({ kind: 'return', hint: 'Step 4: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 4: not (x is +0 and y is -0) — continue.' });
    // 5. If x is -0𝔽 and y is +0𝔽, return true.
    if (Object.is(xVal, -0) && Object.is(yVal, 0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 5: x is -0 and y is +0 → return true.', description: 'Symmetric signed-zero case.' });
      op?.log({ kind: 'return', hint: 'Step 5: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 5: not (x is -0 and y is +0) — continue.' });
    // 6. Return false.
    op?.log({ kind: 'return', hint: 'Step 6: return false.', description: 'Distinct finite Numbers are not equal.' }, Value.false);
    return Value.false;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-sameValue */
  static sameValue(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::sameValue', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. If x is NaN and y is NaN, return true.
    if (x.isNaN() && y.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 1: x is NaN and y is NaN → return true.', description: 'SameValue treats NaN as equal to NaN (unlike ==/===).' });
      op?.log({ kind: 'return', hint: 'Step 1: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 1: not (x and y both NaN) — continue.' });
    const xVal = R(x);
    const yVal = R(y);
    // 2. If x is +0𝔽 and y is -0𝔽, return false.
    if (Object.is(xVal, 0) && Object.is(yVal, -0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 2: x is +0 and y is -0 → return false.', description: 'SameValue distinguishes signed zeros (unlike ==/===).' });
      op?.log({ kind: 'return', hint: 'Step 2: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 2: not (x is +0 and y is -0) — continue.' });
    // 3. If x is -0𝔽 and y is +0𝔽, return false.
    if (Object.is(xVal, -0) && Object.is(yVal, 0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 3: x is -0 and y is +0 → return false.' });
      op?.log({ kind: 'return', hint: 'Step 3: return false.' }, Value.false);
      return Value.false;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 3: not (x is -0 and y is +0) — continue.' });
    // 4. If x is the same Number value as y, return true.
    if (xVal === yVal) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 4: x is the same Number value as y → return true.' });
      op?.log({ kind: 'return', hint: 'Step 4: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 4: x is not the same Number value as y — continue.' });
    // 5. Return false.
    op?.log({ kind: 'return', hint: 'Step 5: return false.' }, Value.false);
    return Value.false;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-sameValueZero */
  static sameValueZero(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::sameValueZero', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. If x is NaN and y is NaN, return true.
    if (x.isNaN() && y.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 1: x is NaN and y is NaN → return true.', description: 'SameValueZero treats NaN as equal to NaN.' });
      op?.log({ kind: 'return', hint: 'Step 1: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 1: not (x and y both NaN) — continue.' });
    const xVal = R(x);
    const yVal = R(y);
    // 2. If x is +0𝔽 and y is -0𝔽, return true.
    if (Object.is(xVal, 0) && Object.is(yVal, -0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 2: x is +0 and y is -0 → return true.', description: 'SameValueZero ignores the sign of zero (unlike SameValue).' });
      op?.log({ kind: 'return', hint: 'Step 2: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 2: not (x is +0 and y is -0) — continue.' });
    // 3. If x is -0𝔽 and y is +0𝔽, return true.
    if (Object.is(xVal, -0) && Object.is(yVal, 0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 3: x is -0 and y is +0 → return true.' });
      op?.log({ kind: 'return', hint: 'Step 3: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 3: not (x is -0 and y is +0) — continue.' });
    // 4. If x is the same Number value as y, return true.
    if (xVal === yVal) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 4: x is the same Number value as y → return true.' });
      op?.log({ kind: 'return', hint: 'Step 4: return true.' }, Value.true);
      return Value.true;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 4: x is not the same Number value as y — continue.' });
    // 5. Return false.
    op?.log({ kind: 'return', hint: 'Step 5: return false.' }, Value.false);
    return Value.false;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-bitwiseAND */
  static bitwiseAND(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::bitwiseAND', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. Return NumberBitwiseOp(&, x, y).
    op?.log({ kind: 'call', hint: 'Step 1: Return NumberBitwiseOp(&, x, y).' });
    const r = NumberBitwiseOp('&', x, y);
    op?.log({ kind: 'return', hint: 'Step 1: return result of NumberBitwiseOp.' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-bitwiseXOR */
  static bitwiseXOR(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::bitwiseXOR', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. Return NumberBitwiseOp(^, x, y).
    op?.log({ kind: 'call', hint: 'Step 1: Return NumberBitwiseOp(^, x, y).' });
    const r = NumberBitwiseOp('^', x, y);
    op?.log({ kind: 'return', hint: 'Step 1: return result of NumberBitwiseOp.' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-bitwiseOR */
  static bitwiseOR(x: NumberValue, y: NumberValue) {
    const op = x.trace.hasActiveOperation()
      ? OperationHandle.begin(x.trace, 'Number::bitwiseOR', x, [OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
      : null;
    // 1. Return NumberBitwiseOp(|, x, y).
    op?.log({ kind: 'call', hint: 'Step 1: Return NumberBitwiseOp(|, x, y).' });
    const r = NumberBitwiseOp('|', x, y);
    op?.log({ kind: 'return', hint: 'Step 1: return result of NumberBitwiseOp.' }, r);
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-number-tostring */
  static override toString(xV: NumberValue, radix: number): JSStringValue {
    const op = xV.trace.hasActiveOperation()
      ? OperationHandle.begin(xV.trace, 'Number::toString', xV, [OperationHandle.formatValue(xV), String(radix)])
      : null;
    // 1. If x is NaN, return "NaN".
    if (xV.isNaN()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 1: x is NaN → return "NaN".' });
      const r = Value('NaN');
      op?.log({ kind: 'return', hint: 'Step 1: return "NaN".' }, r);
      return r;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 1: x is not NaN — continue.' });
    const x = R(xV);
    // 2. If x is +0𝔽 or x is -0𝔽, return "0".
    if (Object.is(x, -0) || Object.is(x, 0)) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 2: x is ±0 → return "0".' });
      const r = Value('0');
      op?.log({ kind: 'return', hint: 'Step 2: return "0".' }, r);
      return r;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 2: x is not ±0 — continue.' });
    // 3. If x < -0𝔽, return the string-concatenation of "-" and Number::toString(-x, radix).
    if (x < 0) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 3: x < 0 → return "-" + Number::toString(-x, radix).' });
      op?.log({ kind: 'call', hint: 'Step 3: recursive call Number::toString(-x, radix).' });
      const negX = F(-x);
      // Thread the active trace record into the freshly-created magnitude so the
      // recursive call nests under this op's Step 3 call (the new value has its own
      // empty trace by default, which would otherwise leave the call step childless).
      if (op) negX.trace = xV.trace;
      const r = Value(`-${NumberValue.toString(negX, radix).stringValue()}`);
      op?.log({ kind: 'return', hint: 'Step 3: return concatenated negative result.' }, r);
      return r;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 3: x ≥ 0 — continue.' });
    // 4. If x is +∞𝔽, return "Infinity".
    if (xV.isInfinity()) {
      op?.log({ kind: 'if', taken: true, hint: 'Step 4: x is +∞ → return "Infinity".' });
      const r = Value('Infinity');
      op?.log({ kind: 'return', hint: 'Step 4: return "Infinity".' }, r);
      return r;
    }
    op?.log({ kind: 'if', taken: false, hint: 'Step 4: x is finite — continue.' });
    // 5. Otherwise, x is a finite positive Number; return the String value consisting of the digits of the decimal representation of x.
    //    (Host-delegated for non-decimal radix.)
    const r = Value(`${x.toString(radix)}`);
    op?.log({ kind: 'return', hint: 'Step 5: return host-formatted digit representation.' }, r);
    return r;
  }

  static readonly unit = new NumberValue(1);

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'Number' });
    createNumberValue = (value) => new NumberValue(value);
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is NumberValue;
}

/** https://tc39.es/ecma262/#sec-numberbitwiseop */
function NumberBitwiseOp(op: '&' | '|' | '^', x: NumberValue, y: NumberValue) {
  const handle = x.trace.hasActiveOperation()
    ? OperationHandle.begin(x.trace, 'NumberBitwiseOp', x, [`'${op}'`, OperationHandle.formatValue(x), OperationHandle.formatValue(y)])
    : null;
  // 1. Let lnum be ! ToInt32(x).
  handle?.log({ kind: 'call', hint: 'Step 1: Let lnum be ! ToInt32(x).' });
  const lnum = X(ToInt32(x));
  // 2. Let rnum be ! ToUint32(y).
  handle?.log({ kind: 'call', hint: 'Step 2: Let rnum be ! ToUint32(y).' });
  const rnum = X(ToUint32(y));
  // 3. Return the result of applying the bitwise operator op to lnum and rnum. The result is a signed 32-bit integer.
  let r: NumberValue;
  switch (op) {
    case '&':
      r = F(R(lnum) & R(rnum));
      break;
    case '|':
      r = F(R(lnum) | R(rnum));
      break;
    case '^':
      r = F(R(lnum) ^ R(rnum));
      break;
    default:
      throw new OutOfRange('NumberBitwiseOp', op);
  }
  handle?.log({ kind: 'return', hint: `Step 3: return lnum ${op} rnum (signed 32-bit integer).` }, r);
  return r;
}

/** https://tc39.es/ecma262/#sec-ecmascript-language-types-bigint-type */
export class BigIntValue extends PrimitiveValue {
  declare readonly type: 'BigInt'; // defined on prototype by static block

  readonly value: bigint;

  private constructor(value: bigint) {
    super();
    this.value = value;
  }

  bigintValue() {
    return this.value;
  }

  isNaN() {
    return false;
  }

  isFinite() {
    return true;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-unaryMinus */
  static unaryMinus(x: BigIntValue) {
    if (R(x) === 0n) {
      return Z(0n);
    }
    return Z(-R(x));
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-bitwiseNOT */
  static bitwiseNOT(x: BigIntValue) {
    return Z(-R(x) - 1n);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-exponentiate */
  static exponentiate(base: BigIntValue, exponent: BigIntValue) {
    // 1. If exponent < 0n, throw a RangeError exception.
    if (R(exponent) < 0n) {
      return Throw.RangeError('Exponent of bigint must be positive');
    }
    // 2. If base is 0n and exponent is 0n, return 1n.
    if (R(base) === 0n && R(exponent) === 0n) {
      return Z(1n);
    }
    // 3. Return the BigInt value that represents the mathematical value of base raised to the power exponent.
    return Z(R(base) ** R(exponent));
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-multiply */
  static multiply(x: BigIntValue, y: BigIntValue) {
    return Z(R(x) * R(y));
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-divide */
  static divide(x: BigIntValue, y: BigIntValue) {
    // 1. If y is 0n, throw a RangeError exception.
    if (R(y) === 0n) {
      return Throw.RangeError('Cannot divide by zero');
    }
    // 2. Let quotient be the mathematical value of x divided by y.
    const quotient = R(x) / R(y);
    // 3. Return the BigInt value that represents quotient rounded towards 0 to the next integral value.
    return Z(quotient);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-remainder */
  static remainder(n: BigIntValue, d: BigIntValue) {
    // 1. If d is 0n, throw a RangeError exception.
    if (R(d) === 0n) {
      return Throw.RangeError('Cannot divide by zero');
    }
    // 2. If n is 0n, return 0n.
    if (R(n) === 0n) {
      return Z(0n);
    }
    // 3. Let r be the BigInt defined by the mathematical relation r = n - (d × q)
    //   where q is a BigInt that is negative only if n/d is negative and positive
    //   only if n/d is positive, and whose magnitude is as large as possible without
    //   exceeding the magnitude of the true mathematical quotient of n and d.
    const r = Z(R(n) % R(d));
    // 4. Return r.
    return r;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-add */
  static add(x: BigIntValue, y: BigIntValue) {
    return Z(R(x) + R(y));
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-subtract */
  static subtract(x: BigIntValue, y: BigIntValue) {
    return Z(R(x) - R(y));
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-leftShift */
  static leftShift(x: BigIntValue, y: BigIntValue) {
    return Z(R(x) << R(y)); // eslint-disable-line no-bitwise
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-signedRightShift */
  static signedRightShift(x: BigIntValue, y: BigIntValue) {
    // 1. Return BigInt::leftShift(x, -y).
    return BigIntValue.leftShift(x, Z(-R(y)));
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-unsignedRightShift */
  static unsignedRightShift(_x: BigIntValue, _y: BigIntValue) {
    return Throw.TypeError('BigInt has no unsigned right shift, use >> instead');
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-lessThan */
  static lessThan(x: BigIntValue, y: BigIntValue) {
    return R(x) < R(y) ? Value.true : Value.false;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-equal */
  static equal(x: BigIntValue, y: BigIntValue) {
    // Return true if x and y have the same mathematical integer value and false otherwise.
    return R(x) === R(y) ? Value.true : Value.false;
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-sameValue */
  static sameValue(x: BigIntValue, y: BigIntValue) {
    // 1. Return BigInt::equal(x, y).
    return BigIntValue.equal(x, y);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-sameValueZero */
  static sameValueZero(x: BigIntValue, y: BigIntValue) {
    // 1. Return BigInt::equal(x, y).
    return BigIntValue.equal(x, y);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-bitwiseAND */
  static bitwiseAND(x: BigIntValue, y: BigIntValue) {
    // 1. Return BigIntBitwiseOp(&, x, y).
    return BigIntBitwiseOp('&', x, y);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-bitwiseXOR */
  static bitwiseXOR(x: BigIntValue, y: BigIntValue) {
    // 1. Return BigIntBitwiseOp(^, x, y).
    return BigIntBitwiseOp('^', x, y);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-bitwiseOR */
  static bitwiseOR(x: BigIntValue, y: BigIntValue) {
    // 1. Return BigIntBitwiseOp(|, x, y);
    return BigIntBitwiseOp('|', x, y);
  }

  /** https://tc39.es/ecma262/#sec-numeric-types-bigint-tostring */
  static override toString(x: BigIntValue, radix: number): JSStringValue {
    // 1. If x is less than zero, return the string-concatenation of the String "-" and ! BigInt::toString(-x).
    if (R(x) < 0n) {
      const str = X(BigIntValue.toString(Z(-R(x)), radix)).stringValue();
      return Value(`-${str}`);
    }
    // 2. Return the String value consisting of the code units of the digits of the decimal representation of x.
    return Value(`${R(x).toString(radix)}`);
  }

  static readonly unit = new BigIntValue(1n);

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'BigInt' });
    createBigIntValue = (value) => new BigIntValue(value);
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is BigIntValue;
}

/** https://tc39.es/ecma262/#sec-bigintbitwiseop */
function BigIntBitwiseOp(op: '&' | '|' | '^', x: BigIntValue, y: BigIntValue) {
  // TODO: figure out why this doesn't work, probably the modulo.
  /*
  // 1. Assert: op is "&", "|", or "^".
  Assert(['&', '|', '^'].includes(op));
  // 2. Let result be 0n.
  let result = 0n;
  // 3. Let shift be 0.
  let shift = 0n;
  // 4. Repeat, until (x = 0 or x = -1) and (y = 0 or y = -1),
  while (!((x === 0n || x === -1n) && (y === 0n || y === -1n))) {
    // a. Let xDigit be x modulo 2.
    const xDigit = x % 2n;
    // b. Let yDigit be y modulo 2.
    const yDigit = y % 2n;
    // c. If op is "&", set result to result + 2^shift × BinaryAnd(xDigit, yDigit).
    if (op === '&') {
      result += (2n ** shift) * BinaryAnd(xDigit, yDigit);
    } else if (op === '|') {
      // d. Else if op is "|", set result to result + 2shift × BinaryOr(xDigit, yDigit).
      result += (2n ** shift) * BinaryXor(xDigit, yDigit);
    } else {
      // i. Assert: op is "^".
      Assert(op === '^');
      // ii. Set result to result + 2^shift × BinaryXor(xDigit, yDigit).
      result += (2n ** shift) * BinaryXor(xDigit, yDigit);
    }
    // f. Set shift to shift + 1.
    shift += 1n;
    // g. Set x to (x - xDigit) / 2.
    x = (x - xDigit) / 2n;
    // h. Set y to (y - yDigit) / 2.
    y = (y - yDigit) / 2n;
  }
  let tmp;
  // 5. If op is "&", let tmp be BinaryAnd(x modulo 2, y modulo 2).
  if (op === '&') {
    tmp = BinaryAnd(x % 2n, y % 2n);
  } else if (op === '|') {
    // 6. Else if op is "|", let tmp be BinaryOr(x modulo 2, y modulo 2).
    tmp = BinaryOr(x % 2n, y % 2n);
  } else {
    // a. Assert: op is "^".
    Assert(op === '^');
    // b. Let tmp be BinaryXor(x modulo 2, y modulo 2).
    tmp = BinaryXor(x % 2n, y % 2n);
  }
  // 8. If tmp ≠ 0, then
  if (tmp !== 0n) {
    // a. Set result to result - 2^shift. NOTE: This extends the sign.
    result -= 2n ** shift;
  }
  // 9. Return result.
  return Z(result);
 */
  switch (op) {
    case '&':
      return Z(R(x) & R(y));
    case '|':
      return Z(R(x) | R(y));
    case '^':
      return Z(R(x) ^ R(y));
    default:
      throw new OutOfRange('BigIntBitwiseOp', op);
  }
}

export interface ObjectInternalMethods<Self> {
  GetPrototypeOf(this: Self): ValueEvaluator<ObjectValue | NullValue>;
  SetPrototypeOf(this: Self, V: ObjectValue | NullValue): ValueEvaluator<BooleanValue>;
  IsExtensible(this: Self): ValueEvaluator<BooleanValue>;
  PreventExtensions(this: Self): ValueEvaluator<BooleanValue>;
  GetOwnProperty(this: Self, P: PropertyKeyValue): PlainEvaluator<Descriptor | UndefinedValue>;
  DefineOwnProperty(this: Self, P: PropertyKeyValue, Desc: Descriptor): ValueEvaluator<BooleanValue>;
  HasProperty(this: Self, P: PropertyKeyValue): ValueEvaluator<BooleanValue>;
  Get(this: Self, P: PropertyKeyValue, Receiver: Value): ValueEvaluator;
  Set(this: Self, P: PropertyKeyValue, V: Value, Receiver: Value): ValueEvaluator<BooleanValue>;
  Delete(this: Self, P: PropertyKeyValue): ValueEvaluator<BooleanValue>;
  OwnPropertyKeys(this: Self): PlainEvaluator<PropertyKeyValue[]>;
  Call?(this: Self, thisArg: Value, args: Arguments): ValueEvaluator;
  Construct?(this: Self, args: Arguments, newTarget: FunctionObject | UndefinedValue): ValueEvaluator<ObjectValue>;
}

type ObjectSlotReturn = {
  [key in keyof ObjectInternalMethods<ObjectValue>]: ReturnType<NonNullable<ObjectInternalMethods<ObjectValue>[key]>>
};
/** https://tc39.es/ecma262/#sec-object-type */
export class ObjectValue extends Value implements ObjectInternalMethods<ObjectValue> {
  declare readonly type: 'Object'; // defined on prototype by static block

  readonly properties: PropertyKeyMap<Descriptor>;

  readonly internalSlotsList: readonly string[];

  readonly PrivateElements: PrivateElementRecord[];

  // https://tc39.es/proposal-pattern-matching/#sec-object-internal-methods-and-internal-slots
  readonly ConstructedBy: (ECMAScriptFunctionObject | DefaultConstructorBuiltinFunction)[];

  constructor(internalSlotsList: readonly string[]) {
    super();

    this.PrivateElements = [];
    this.ConstructedBy = [];
    this.properties = new PropertyKeyMap();
    this.internalSlotsList = internalSlotsList;
    surroundingAgent.debugger_markObjectCreated(this);
  }

  // UNSAFE casts below. Methods below are expected to be rewritten when the object is not an OrdinaryObject. (an example is ArgumentExoticObject)
  // If those methods aren't rewritten, it is an error.
  // eslint-disable-next-line require-yield
  * GetPrototypeOf(): ObjectSlotReturn['GetPrototypeOf'] {
    return OrdinaryGetPrototypeOf(this as unknown as OrdinaryObject);
  }

  // eslint-disable-next-line require-yield
  * SetPrototypeOf(V: ObjectValue | NullValue): ObjectSlotReturn['SetPrototypeOf'] {
    Q(surroundingAgent.debugger_tryTouchDuringPreview(this));
    return OrdinarySetPrototypeOf(this as unknown as OrdinaryObject, V);
  }

  // eslint-disable-next-line require-yield
  * IsExtensible(): ObjectSlotReturn['IsExtensible'] {
    return OrdinaryIsExtensible(this as unknown as OrdinaryObject);
  }

  // eslint-disable-next-line require-yield
  * PreventExtensions(): ObjectSlotReturn['PreventExtensions'] {
    Q(surroundingAgent.debugger_tryTouchDuringPreview(this));
    return OrdinaryPreventExtensions(this as unknown as OrdinaryObject);
  }

  // eslint-disable-next-line require-yield
  * GetOwnProperty(P: PropertyKeyValue): ObjectSlotReturn['GetOwnProperty'] {
    return OrdinaryGetOwnProperty(this as unknown as OrdinaryObject, P);
  }

  * DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): ObjectSlotReturn['DefineOwnProperty'] {
    Q(surroundingAgent.debugger_tryTouchDuringPreview(this));
    return yield* OrdinaryDefineOwnProperty(this as unknown as OrdinaryObject, P, Desc);
  }

  * HasProperty(P: PropertyKeyValue): ObjectSlotReturn['HasProperty'] {
    return yield* OrdinaryHasProperty(this as unknown as OrdinaryObject, P);
  }

  * Get(P: PropertyKeyValue, Receiver: Value): ObjectSlotReturn['Get'] {
    return yield* OrdinaryGet(this as unknown as OrdinaryObject, P, Receiver);
  }

  * Set(P: PropertyKeyValue, V: Value, Receiver: Value): ObjectSlotReturn['Set'] {
    // TODO:
    Q(surroundingAgent.debugger_tryTouchDuringPreview(Receiver as ObjectValue));
    return yield* OrdinarySet(this as unknown as OrdinaryObject, P, V, Receiver);
  }

  * Delete(P: PropertyKeyValue): ObjectSlotReturn['Delete'] {
    Q(surroundingAgent.debugger_tryTouchDuringPreview(this));
    return yield* OrdinaryDelete(this as unknown as OrdinaryObject, P);
  }

  // eslint-disable-next-line require-yield
  * OwnPropertyKeys(): ObjectSlotReturn['OwnPropertyKeys'] {
    return OrdinaryOwnPropertyKeys(this as unknown as OrdinaryObject);
  }

  // NON-SPEC
  mark(m: GCMarker) {
    m(this.properties);
    this.internalSlotsList.forEach((s) => {
      // @ts-ignore
      m(this[s]);
      if (s === 'HostCapturedValues' && s in this && Array.isArray(this[s])) {
        this[s].forEach(m);
      }
    });
  }

  static {
    Object.defineProperty(this.prototype, 'type', { value: 'Object' });
  }

  declare static [Symbol.hasInstance]: (value: unknown) => value is ObjectValue;
}

/** https://tc39.es/ecma262/#sec-private-names */
export class PrivateName {
  // NOTE: The following declaration distinguishes `PrivateName` from `SymbolValue` so that type guards can properly
  //       remove it from unions with `SymbolValue` due to structural overlap.
  declare private _: never;

  readonly Description: JSStringValue;

  constructor(description: JSStringValue) {
    this.Description = description;
  }
}

export class ReferenceRecord {
  readonly Base: 'unresolvable' | Value | EnvironmentRecord;

  ReferencedName: Value | PrivateName;

  readonly Strict: BooleanValue;

  readonly ThisValue: Value | undefined;

  constructor({
    Base,
    ReferencedName,
    Strict,
    ThisValue,
  }: Pick<ReferenceRecord, 'Base' | 'ReferencedName' | 'Strict' | 'ThisValue'>) {
    this.Base = Base;
    this.ReferencedName = ReferencedName;
    this.Strict = Strict;
    this.ThisValue = ThisValue;
  }

  // NON-SPEC
  mark(m: GCMarker) {
    m(this.Base);
    m(this.ReferencedName);
    m(this.ThisValue);
  }
}

export type DescriptorInit = Pick<Descriptor, 'Configurable' | 'Enumerable' | 'Get' | 'Set' | 'Value' | 'Writable'>;
// @ts-expect-error
export function Descriptor(O: DescriptorInit): Descriptor // @ts-expect-error
export @callable() class Descriptor {
  readonly Value?: Value;

  readonly Get?: FunctionObject | UndefinedValue;

  readonly Set?: FunctionObject | UndefinedValue;

  readonly Writable?: BooleanValue;

  readonly Enumerable?: BooleanValue;

  readonly Configurable?: BooleanValue;

  constructor(O: Pick<Descriptor, 'Configurable' | 'Enumerable' | 'Get' | 'Set' | 'Value' | 'Writable'>) {
    this.Value = O.Value;
    this.Get = O.Get;
    this.Set = O.Set;
    this.Writable = O.Writable;
    this.Enumerable = O.Enumerable;
    this.Configurable = O.Configurable;
  }

  everyFieldIsAbsent() {
    return this.Value === undefined
      && this.Get === undefined
      && this.Set === undefined
      && this.Writable === undefined
      && this.Enumerable === undefined
      && this.Configurable === undefined;
  }

  // NON-SPEC
  mark(m: GCMarker) {
    m(this.Value);
    m(this.Get);
    m(this.Set);
  }
}

export class DataBlock extends Uint8Array {
  constructor(sizeOrBuffer: number | ArrayBuffer, byteOffset?: number, length?: number) {
    if (sizeOrBuffer instanceof ArrayBuffer) {
      super(sizeOrBuffer, byteOffset, length);
    } else {
      Assert(typeof sizeOrBuffer === 'number');
      super(sizeOrBuffer);
    }
  }
}

/** https://tc39.es/ecma262/#sec-sametype */
export function SameType(x: Value, y: Value) {
  switch (true) {
    case x === Value.undefined && y === Value.undefined:
    case x === Value.null && y === Value.null:
    case x instanceof BooleanValue && y instanceof BooleanValue:
    case x instanceof NumberValue && y instanceof NumberValue:
    case x instanceof BigIntValue && y instanceof BigIntValue:
    case x instanceof SymbolValue && y instanceof SymbolValue:
    case x instanceof JSStringValue && y instanceof JSStringValue:
    case x instanceof ObjectValue && y instanceof ObjectValue:
      return true;
    default:
      return false;
  }
}

type SafeAccessMethods = 'map' | 'values' | 'entries' | 'filter' | 'forEach' | 'find';
// function* myFunction([callback]: Arguments, { thisValue }: FunctionCallContext): ValueEvaluator
//                       ^^^^^^^^
// if user calls myFunction with no arguments, callback would be undefined, not Value.undefined
// the correct way is to type it as:
// function* myFunction([callback = Value.undefined]: Arguments, { thisValue }: FunctionCallContext): ValueEvaluator
//
// this type is to prevent such mistakes
export type Arguments =
  Omit<readonly (Value | undefined)[], SafeAccessMethods> &
  Pick<readonly Value[], SafeAccessMethods>;
export interface FunctionCallContext {
  readonly thisValue: Value;
  readonly NewTarget: FunctionObject | UndefinedValue;
}
export interface NativeSteps {
  (this: BuiltinFunctionObject, args: Arguments, context: FunctionCallContext): PlainEvaluator<Value | void> | PlainCompletion<Value | void>;
  section?: string;
  isConstructor?: boolean;
}
export interface CanBeNativeSteps {
  (...args: (Value | undefined)[]): PlainEvaluator<Value | void> | PlainCompletion<Value | void>;
}
