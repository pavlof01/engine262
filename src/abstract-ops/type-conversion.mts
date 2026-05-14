import {
  UndefinedValue,
  JSStringValue,
  SymbolValue,
  ObjectValue,
  Value,
  NumberValue,
  BigIntValue,
  wellKnownSymbols,
  NullValue,
  BooleanValue,
  PrimitiveValue,
  type PropertyKeyValue,
} from "../value.mts";
import { surroundingAgent } from "../host-defined/engine.mts";
import { Q, X, type ValueCompletion } from "../completion.mts";
import { OutOfRange, type Mutable } from "../helpers.mts";
import { MV_StringNumericLiteral } from "../runtime-semantics/all.mts";
import type { BooleanObject } from "../intrinsics/Boolean.mts";
import type { NumberObject } from "../intrinsics/Number.mts";
import type { SymbolObject } from "../intrinsics/Symbol.mts";
import type { BigIntObject } from "../intrinsics/BigInt.mts";
import type { PlainEvaluator, ValueEvaluator } from "../evaluator.mts";
import { OperationHandle } from "../trace-builder.mts";
import {
  Assert,
  Call,
  Get,
  GetMethod,
  IsCallable,
  OrdinaryObjectCreate,
  SameValue,
  StringCreate,
  Z,
  F,
  R,
} from "./all.mts";

/** https://tc39.es/ecma262/#sec-toprimitive */
export function* ToPrimitive(input: Value, preferredType?: "string" | "number"): ValueEvaluator<PrimitiveValue> {
  const op = OperationHandle.begin(input.trace, "ToPrimitive", input);
  // 1. Assert: input is an ECMAScript language value.
  Assert(input instanceof Value);
  op.log({
    kind: "assert",
    hint: "Step 1: Assert — input is an ECMAScript language value.",
    description: "Sanity check: input must be a language value (undefined, null, primitive, or object). Internal spec values are not allowed.",
  });
  // 2. If Type(input) is Object, then
  if (input instanceof ObjectValue) {
    op.log({
      kind: "if",
      taken: true,
      hint: "Step 2: input is an Object — look for @@toPrimitive method.",
      description: "Only objects need conversion. Primitives short-circuit straight to Step 3. Objects must be reduced to a primitive via either a custom @@toPrimitive or the default valueOf/toString protocol.",
    });
    // a. Let exoticToPrim be ? GetMethod(input, @@toPrimitive).
    op.log({
      kind: "call",
      hint: "Step 2a: Let exoticToPrim be ? GetMethod(input, @@toPrimitive).",
      description: "Check whether the object defines a custom Symbol.toPrimitive method (overrides default coercion, e.g. Date, Symbol wrappers).",
    });
    const exoticToPrim = Q(yield* GetMethod(input, wellKnownSymbols.toPrimitive));
    // b. If exoticToPrim is not undefined, then
    if (exoticToPrim !== Value.undefined) {
      op.log({
        kind: "if",
        taken: true,
        hint: "Step 2b: exoticToPrim is not undefined — determine hint string.",
        description: "Object provides its own conversion — use it instead of the valueOf/toString protocol. We pass a hint so the method knows the caller's preference.",
      });
      // i–iii. Determine hint string.
      let hint;
      if (preferredType === undefined) {
        hint = Value("default");
        op.log({
          kind: "if",
          taken: true,
          hint: 'Step 2b-i: preferredType is not present — let hint be "default".',
          description: 'No preferred type means the caller has no preference (e.g. the `+` operator) — pass "default" so the object decides what to produce.',
        });
      } else if (preferredType === "string") {
        hint = Value("string");
        op.log({
          kind: "if",
          taken: true,
          hint: 'Step 2b-ii: preferredType is "string" — let hint be "string".',
          description: 'Caller wants a string (e.g. template literal, String(obj), property key) — ask the object for a string representation.',
        });
      } else {
        Assert(preferredType === "number");
        hint = Value("number");
        op.log({
          kind: "note",
          hint: 'Step 2b-iii: preferredType is "number" — let hint be "number".',
          description: 'Caller wants a number (e.g. arithmetic, Number(obj)) — ask the object for a numeric representation.',
        });
      }
      // iv. Let result be ? Call(exoticToPrim, input, « hint »).
      op.log({
        kind: "call",
        hint: `Step 2b-iv: Let result be ? Call(exoticToPrim, input, « "${(hint as JSStringValue).stringValue()}" »).`,
        description: "Invoke the user-defined @@toPrimitive method with the resolved hint. The method must return a primitive.",
      });
      const result = Q(yield* Call(exoticToPrim, input, [hint]));
      // v. If Type(result) is not Object, return result.
      if (!(result instanceof ObjectValue)) {
        op.log(
          {
            kind: "return",
            hint: `Step 2b-v: result is not an Object (${result.type}) — return result.`,
            description: "Custom method returned a primitive as required — accept and propagate.",
          },
          result,
        );
        return result;
      }
      // vi. Throw a TypeError exception.
      op.log({
        kind: "throw",
        hint: "Step 2b-vi: result is an Object — throw TypeError.",
        description: "@@toPrimitive returned an Object, which violates the contract. The spec demands a primitive, so this is a programmer bug → TypeError.",
      });
      return surroundingAgent.Throw("TypeError", "ObjectToPrimitive");
    }
    op.log({
      kind: "if",
      taken: false,
      hint: "Step 2b: exoticToPrim is undefined — fall back to OrdinaryToPrimitive.",
      description: "No custom Symbol.toPrimitive — use the default valueOf/toString protocol via OrdinaryToPrimitive.",
    });
    // c. If preferredType is not present, let preferredType be number.
    if (preferredType === undefined) {
      preferredType = "number";
    }
    op.log({
      kind: "if",
      taken: true,
      hint: `Step 2c: preferredType → "${preferredType}" — call OrdinaryToPrimitive.`,
      description: 'When no preferredType is given, default to "number" — this matches what arithmetic operators (the common case) expect.',
    });
    // d. Return ? OrdinaryToPrimitive(input, preferredType).
    op.log({
      kind: "call",
      hint: `Step 2d: Return ? OrdinaryToPrimitive(input, "${preferredType}").`,
      description: "Run the default protocol: tries valueOf() and toString() in an order determined by the hint.",
    });
    const primResult = Q(yield* OrdinaryToPrimitive(input, preferredType));
    op.log(
      {
        kind: "return",
        hint: `Step 2d: OrdinaryToPrimitive returned ${primResult.type}.`,
        description: "Surface the primitive that the default protocol produced as the result of ToPrimitive.",
      },
      primResult,
    );
    return primResult;
  }
  // 3. Return input.
  op.log(
    {
      kind: "return",
      hint: "Step 3: input is already a primitive — return input as-is.",
      description: "Primitives don't need conversion — they're already in primitive form.",
    },
    input,
  );
  return input;
}

/** https://tc39.es/ecma262/#sec-ordinarytoprimitive */
export function* OrdinaryToPrimitive(O: ObjectValue, hint: "string" | "number"): ValueEvaluator<PrimitiveValue> {
  const op = OperationHandle.begin(O.trace, "OrdinaryToPrimitive", O);
  // 1. Assert: Type(O) is Object.
  Assert(O instanceof ObjectValue);
  // 2. Assert: hint is either string or number.
  Assert(hint === "string" || hint === "number");
  let methodNames;
  // 3. If hint is string, then
  if (hint === "string") {
    // a. Let methodNames be « "toString", "valueOf" ».
    methodNames = [Value("toString"), Value("valueOf")];
    op.log({
      kind: "if",
      taken: true,
      hint: 'Step 3: hint is "string" — methodNames = « "toString", "valueOf" ».',
      description: 'For string hint, toString() is tried first (it usually produces a string), then valueOf() as fallback. Method order matters: the first one that returns a primitive wins.',
    });
  } else {
    // 4. Else,
    // a. Let methodNames be « "valueOf", "toString" ».
    methodNames = [Value("valueOf"), Value("toString")];
    op.log({
      kind: "if",
      taken: true,
      hint: 'Step 4: hint is "number" — methodNames = « "valueOf", "toString" ».',
      description: 'For number hint, valueOf() is tried first (it usually produces a number), then toString() as fallback. Method order matters: the first one that returns a primitive wins.',
    });
  }
  // 5. For each element name of methodNames, do
  for (const name of methodNames) {
    const nameStr = (name as JSStringValue).stringValue();
    // a. Let method be ? Get(O, name).
    op.log({
      kind: "call",
      hint: `Step 5a: Let method be ? Get(O, "${nameStr}").`,
      description: `Look up "${nameStr}" on the object (walks the prototype chain). May return undefined if no such property exists.`,
    });
    const method = Q(yield* Get(O, name));
    // b. If IsCallable(method) is true, then
    if (IsCallable(method)) {
      op.log({
        kind: "if",
        taken: true,
        hint: `Step 5b: ${nameStr} is callable.`,
        description: `Property "${nameStr}" exists and is a function — attempt to invoke it.`,
      });
      // i. Let result be ? Call(method, O).
      op.log({
        kind: "call",
        hint: `Step 5b-i: Let result be ? Call(method, O) — calling ${nameStr}().`,
        description: `Invoke ${nameStr}() with the object as the receiver (this).`,
      });
      const result = Q(yield* Call(method, O));
      // ii. If Type(result) is not Object, return result.
      if (!(result instanceof ObjectValue)) {
        op.log(
          {
            kind: "return",
            hint: `Step 5b-ii: ${nameStr}() returned a primitive (${result.type}) — return result.`,
            description: `${nameStr}() returned a usable primitive — that's the answer. No need to try the other method.`,
          },
          result,
        );
        return result;
      }
      op.log({
        kind: "if",
        taken: false,
        hint: `Step 5b-ii: ${nameStr}() returned an Object — try next method.`,
        description: `${nameStr}() returned another object (e.g. a wrapper or this). Useless for coercion — fall through to the next candidate.`,
      });
    } else {
      op.log({
        kind: "if",
        taken: false,
        hint: `Step 5b: ${nameStr} is not callable — skip, try next method.`,
        description: `"${nameStr}" is missing or not a function (e.g. overridden with a non-function value). Skip it.`,
      });
    }
  }
  // 6. Throw a TypeError exception.
  op.log({
    kind: "throw",
    hint: "Step 6: No method returned a primitive — throw TypeError.",
    description: "Both valueOf() and toString() either were not callable or kept returning objects. With no way to obtain a primitive, the spec gives up with TypeError.",
  });
  return surroundingAgent.Throw("TypeError", "ObjectToPrimitive");
}

/** https://tc39.es/ecma262/#sec-toboolean */
export function ToBoolean(argument: Value): BooleanValue {
  const op = OperationHandle.begin(argument.trace, "ToBoolean", argument);
  if (argument instanceof UndefinedValue) {
    op.log({
      kind: "return",
      value: "false",
      type: argument.type,
      hint: "If argument is undefined, return false.",
      description: "undefined is one of the falsy values — represents absence.",
    });
    return Value.false;
  } else if (argument instanceof NullValue) {
    op.log({
      kind: "return",
      value: "false",
      type: argument.type,
      hint: "If argument is null, return false.",
      description: "null is falsy — represents intentional empty value.",
    });
    return Value.false;
  } else if (argument instanceof BooleanValue) {
    op.log({
      kind: "return",
      value: argument === Value.true ? "true" : "false",
      type: argument.type,
      hint: "Argument is already boolean, return as-is.",
      description: "Identity case: boolean stays boolean.",
    });
    return argument;
  } else if (argument instanceof NumberValue) {
    op.log({
      kind: "if",
      value: String(R(argument)),
      type: argument.type,
      hint: "If number is +0, -0, or NaN, return false; otherwise true.",
      description: "Falsy numbers: ±0 (no quantity) and NaN (not a real result). All other numbers — positive, negative, Infinity — are truthy.",
    });
    if (R(argument) === 0 || argument.isNaN()) {
      return Value.false;
    }
  } else if (argument instanceof JSStringValue) {
    op.log({
      kind: "if",
      value: argument.stringValue(),
      type: argument.type,
      hint: "If string is empty, return false; otherwise true.",
      description: 'Only the empty string "" is falsy. Note: "0", "false", and " " are all truthy.',
    });
    if (argument.stringValue().length === 0) {
      return Value.false;
    }
  } else if (argument instanceof BigIntValue) {
    op.log({
      kind: "if",
      value: String(R(argument)),
      type: argument.type,
      hint: "If BigInt is 0ℤ, return false; otherwise true.",
      description: "Mirrors Number rules: only 0n is falsy, any non-zero BigInt is truthy.",
    });
    if (R(argument) === 0n) {
      return Value.false;
    }
  } else if (argument instanceof SymbolValue) {
    op.log({
      kind: "return",
      value: "true",
      type: argument.type,
      hint: "Symbol always converts to true.",
      description: "Every Symbol is unique and non-empty — there is no falsy Symbol value.",
    });
    return Value.true;
  } else if (argument instanceof ObjectValue) {
    op.log({
      kind: "return",
      value: "true",
      type: argument.type,
      hint: "Object always converts to true.",
      description: "All objects are truthy — even empty arrays [], empty objects {}, and `new Boolean(false)`. Only primitives can be falsy.",
    });
    return Value.true;
  }
  return Value.true;
}

/** https://tc39.es/ecma262/#sec-tonumeric */
export function* ToNumeric(value: Value): ValueEvaluator<NumberValue | BigIntValue> {
  const op = OperationHandle.begin(value.trace, "ToNumeric", value);

  // 1. Let primValue be ? ToPrimitive(value, number).
  op.log({
    kind: "call",
    hint: 'Call ToPrimitive with hint "number".',
    description: 'First reduce the value to a primitive. The "number" hint tells objects to prefer valueOf() (which usually returns a numeric type).',
  });
  const primValue = Q(yield* ToPrimitive(value, "number"));
  // 2. If Type(primValue) is BigInt, return primValue.
  if (primValue instanceof BigIntValue) {
    op.log(
      {
        kind: "return",
        hint: "Result is BigInt, return as-is.",
        description: "BigInt primitives stay BigInt. ToNumeric (unlike ToNumber) supports both numeric types — no implicit narrowing.",
      },
      primValue,
    );
    return primValue;
  }
  // 3. Return ? ToNumber(primValue).
  op.log({
    kind: "call",
    hint: "Result is not BigInt, call ToNumber.",
    description: "Any non-BigInt primitive flows through ToNumber to become a Number.",
  });
  const result = Q(yield* ToNumber(primValue));
  op.log(
    {
      kind: "return",
      hint: `Step 3: ToNumber returned ${R(result)}.`,
      description: "Final numeric result. Caller can now treat it as Number or BigInt by checking its type.",
    },
    result,
  );
  return result;
}

/** https://tc39.es/ecma262/#sec-tonumber */
export function* ToNumber(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToNumber", argument);

  if (argument instanceof NumberValue) {
    op.log(
      {
        kind: "return",
        hint: "Step 1: argument is a Number — return argument as-is.",
        description: "Identity case: Number stays Number, no conversion needed.",
      },
      argument,
    );
    return argument;
  } else {
    op.log({
      kind: "if",
      hint: "Step 1: argument is not a Number — continue.",
      description: "Argument is some other type — check the remaining cases.",
    });
  }

  if (argument instanceof BigIntValue) {
    op.log({
      kind: "throw",
      hint: "Step 2: argument is a BigInt — throw TypeError.",
      description: "Implicit BigInt → Number conversion is forbidden to prevent silent precision loss. Use Number(bigint) explicitly if you really want this.",
    });
    return surroundingAgent.Throw("TypeError", "CannotMixBigInts");
  } else if (argument instanceof SymbolValue) {
    op.log({
      kind: "throw",
      hint: "Step 2: argument is a Symbol — throw TypeError.",
      description: "Symbols have unique identity and no numeric interpretation. Coercing one to a number would lose meaning.",
    });
    return surroundingAgent.Throw("TypeError", "CannotConvertSymbol", "number");
  } else {
    op.log({
      kind: "if",
      hint: "Step 2: argument is not a Symbol or BigInt — continue.",
      description: "Cleared the throw-only cases; the remaining types are convertible.",
    });
  }

  if (argument instanceof UndefinedValue) {
    const nanResult = F(NaN);
    nanResult.trace = argument.trace;
    op.log(
      {
        kind: "return",
        hint: "Step 3: argument is undefined — return NaN.",
        description: "undefined has no defined numeric value — represented as NaN.",
      },
      nanResult,
    );
    return nanResult;
  } else {
    op.log({
      kind: "if",
      hint: "Step 3: argument is not undefined — continue.",
      description: "Not undefined — continue type checks.",
    });
  }

  if (argument instanceof NullValue) {
    const result = F(+0);
    result.trace = argument.trace;
    op.log(
      {
        kind: "return",
        hint: "Step 4: argument is null — return +0𝔽.",
        description: "Legacy quirk: null coerces to 0 (unlike undefined → NaN). Why null and undefined differ here is a historical accident.",
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: "Step 4: argument is not null — continue.",
      description: "Not null — continue.",
    });
  }

  if (argument instanceof BooleanValue) {
    const boolValue = argument === Value.true ? 1 : 0;
    const result = F(boolValue);
    result.trace = argument.trace;
    if (argument === Value.true) {
      op.log(
        {
          kind: "return",
          hint: "Step 5: argument is true — return 1𝔽.",
          description: "true → 1, false → 0. Standard boolean-as-number convention.",
        },
        result,
      );
    } else {
      op.log(
        {
          kind: "return",
          hint: "Step 4: argument is false — return +0𝔽.",
          description: "true → 1, false → 0. Standard boolean-as-number convention.",
        },
        result,
      );
    }
    return result;
  } else {
    op.log({
      kind: "if",
      hint: "Step 4: argument is not false — continue.",
      description: "Not boolean — continue.",
    });
    op.log({
      kind: "if",
      hint: "Step 5: argument is not true — continue.",
      description: "Not boolean — continue.",
    });
  }

  if (argument instanceof JSStringValue) {
    const strVal = argument.stringValue();
    op.log({
      kind: "call",
      hint: `Step 6: argument is a String — call StringToNumber("${strVal}").`,
      description: 'Parse the string as a numeric literal: trim whitespace, accept decimal/hex/octal/binary forms, support exponents. Returns NaN if parsing fails.',
    });
    const result = MV_StringNumericLiteral(strVal, argument);
    op.log(
      {
        kind: "return",
        hint: `Step 6: StringToNumber("${strVal}") = ${R(result)}.`,
        description: 'Empty string "" → 0, "  " → 0, "42" → 42, "abc" → NaN.',
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: "Step 6: argument is not a String — continue.",
      description: "Not a string — only Object remains.",
    });
  }

  if (argument instanceof ObjectValue) {
    op.log({
      kind: "assert",
      hint: "Step 7: Assert — argument is an Object.",
      description: "By elimination — all other types handled above.",
    });
    op.log({
      kind: "call",
      hint: 'Step 8: Let primValue be ? ToPrimitive(argument, "number").',
      description: 'Reduce the object to a primitive via valueOf()/toString() with number hint. Then recurse to convert that primitive to a Number.',
    });
    const primValue = Q(yield* ToPrimitive(argument, "number"));
    Assert(!(primValue instanceof ObjectValue));
    op.log({
      kind: "assert",
      hint: `Step 9: Assert — primValue is not an Object (type: ${primValue.type}).`,
      description: "ToPrimitive guarantees a primitive — if it failed it would have thrown. Safe to recurse.",
    });
    primValue.trace = argument.trace;
    op.log({
      kind: "call",
      hint: "Step 10: Return ? ToNumber(primValue).",
      description: "Recursive call: now convert the primitive (string/number/boolean/etc.) to a Number using the rules above.",
    });
    const finalResult = Q(yield* ToNumber(primValue));
    op.log(
      {
        kind: "return",
        hint: `Step 10: ToNumber(primValue) = ${R(finalResult)}.`,
        description: "Final Number result for the original object.",
      },
      finalResult,
    );
    return finalResult;
  }

  throw new OutOfRange("ToNumber", { argument });
}

const mod = (n: number, m: number) => {
  const r = n % m;
  return Math.floor(r >= 0 ? r : r + m);
};

/** https://tc39.es/ecma262/#sec-tointegerorinfinity */
export function* ToIntegerOrInfinity(argument: Value): PlainEvaluator<number> {
  const op = OperationHandle.begin(argument.trace, "ToIntegerOrInfinity", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number first; fractional and special values are handled in the following steps.",
  });
  const number = Q(yield* ToNumber(argument));
  // 2. If number is NaN, +0𝔽, or -0𝔽, return 0.
  if (number.isNaN() || R(number) === 0) {
    op.log({
      kind: "return",
      hint: "Number is NaN or ±0, return 0.",
      description: "NaN and zeros collapse to 0 so integer arithmetic stays well-defined.",
    });
    return +0;
  }
  // 3. If number is +∞𝔽, return +∞.
  // 4. If number is -∞𝔽, return -∞.
  if (!number.isFinite()) {
    op.log({
      kind: "return",
      hint: `Number is ${R(number) > 0 ? "+" : "-"}∞, return as-is.`,
      description: "Infinity passes through — used for unbounded ranges (e.g. array slice lengths).",
    });
    return R(number);
  }
  // 4. Let integer be floor(abs(ℝ(number))).
  let integer = Math.floor(Math.abs(R(number)));
  // 5. If number < +0𝔽, set integer to -integer.
  if (R(number) < 0 && integer !== 0) {
    integer = -integer;
  }
  // 6. Return integer.
  op.log({
    kind: "return",
    hint: `Convert to integer: ${integer}.`,
    description: "Truncate towards zero (floor for positive, ceil for negative). Same as Math.trunc().",
  });
  return integer;
}

/** https://tc39.es/ecma262/#sec-toint32 */
export function* ToInt32(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToInt32", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number first. ToInt32 then wraps it into a 32-bit signed integer.",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
  if (Number.isNaN(number) || number === 0 || !Number.isFinite(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, ±0, or infinite, return +0.",
      description: "Non-finite or zero numbers collapse to 0 — needed so bitwise ops like (x | 0) always yield a valid int32.",
    });
    return F(+0);
  }
  // 3. Let int be truncate(ℝ(number)).
  const int = Math.trunc(number);
  op.log({
    kind: "operation",
    hint: `After truncation: ${int}`,
    description: "Drop the fractional part (truncate towards zero) before bit-width wrapping.",
  });
  // 4. Let int32bit be int modulo 2^32.
  const int32bit = mod(int, 2 ** 32);
  // 5. If int32bit ≥ 2^31, return 𝔽(int32bit - 2^32); otherwise return 𝔽(int32bit).
  if (int32bit >= 2 ** 31) {
    const result = int32bit - 2 ** 32;
    op.log({
      kind: "return",
      hint: `Convert to signed int32: ${result}.`,
      description: "Two's-complement interpretation: values ≥ 2³¹ wrap into the negative half (e.g. 2³¹ → -2³¹).",
    });
    return F(result);
  }
  op.log({
    kind: "return",
    hint: `Convert to int32: ${int32bit}.`,
    description: "Value fits in the positive half of the signed 32-bit range — return as-is.",
  });
  return F(int32bit);
}

/** https://tc39.es/ecma262/#sec-touint32 */
export function* ToUint32(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToUint32", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number first; ToUint32 then wraps it into an unsigned 32-bit integer (range 0..2³²-1).",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
  if (Number.isNaN(number) || number === 0 || !Number.isFinite(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, ±0, or infinite, return +0.",
      description: "Non-finite or zero values map to 0. Used by >>> 0 idiom for safe uint conversion.",
    });
    return F(+0);
  }
  // 3. Let int be truncate(ℝ(number)).
  const int = Math.trunc(number);
  op.log({
    kind: "operation",
    hint: `After truncation: ${int}`,
    description: "Drop fractional part before bit-width wrapping.",
  });
  // 4. Let int32bit be int modulo 2^32.
  const int32bit = mod(int, 2 ** 32);
  // 5. Return 𝔽(int32bit).
  op.log({
    kind: "return",
    hint: `Convert to uint32: ${int32bit >>> 0}.`,
    description: "Modulo 2³² gives an unsigned 32-bit value. Negative inputs wrap to the upper half.",
  });
  return F(int32bit);
}

/** https://tc39.es/ecma262/#sec-toint16 */
export function* ToInt16(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToInt16", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number first; ToInt16 then wraps it into a 16-bit signed integer.",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
  if (Number.isNaN(number) || number === 0 || !Number.isFinite(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, ±0, or infinite, return +0.",
      description: "Non-finite or zero values map to 0.",
    });
    return F(+0);
  }
  // 3. Let int be truncate(ℝ(number)).
  const int = Math.trunc(number);
  op.log({
    kind: "operation",
    hint: `After truncation: ${int}`,
    description: "Drop fractional part before bit-width wrapping.",
  });
  // 4. Let int16bit be int modulo 2^16.
  const int16bit = mod(int, 2 ** 16);
  // 5. If int16bit ≥ 2^31, return 𝔽(int16bit - 2^32); otherwise return 𝔽(int16bit).
  if (int16bit >= 2 ** 15) {
    const result = int16bit - 2 ** 16;
    op.log({
      kind: "return",
      hint: `Convert to signed int16: ${result}.`,
      description: "Two's-complement: values ≥ 2¹⁵ wrap into the negative half of the int16 range.",
    });
    return F(result);
  }
  op.log({
    kind: "return",
    hint: `Convert to int16: ${int16bit}.`,
    description: "Value fits in the positive half of the int16 range.",
  });
  return F(int16bit);
}

/** https://tc39.es/ecma262/#sec-touint16 */
export function* ToUint16(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToUint16", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number; ToUint16 wraps into unsigned 16-bit (used by Uint16Array writes, String.fromCharCode, etc.).",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
  if (Number.isNaN(number) || number === 0 || !Number.isFinite(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, ±0, or infinite, return +0.",
      description: "Non-finite or zero values map to 0.",
    });
    return F(+0);
  }
  // 3. Let int be truncate(ℝ(number)).
  const int = Math.trunc(number);
  op.log({
    kind: "operation",
    hint: `After truncation: ${int}`,
    description: "Drop fractional part before bit-width wrapping.",
  });
  // 4. Let int16bit be int modulo 2^16.
  const int16bit = mod(int, 2 ** 16);
  // 5. Return 𝔽(int16bit).
  op.log({
    kind: "return",
    hint: `Convert to uint16: ${int16bit & 0xffff}.`,
    description: "Modulo 2¹⁶ — value in [0, 65535].",
  });
  return F(int16bit);
}

/** https://tc39.es/ecma262/#sec-toint8 */
export function* ToInt8(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToInt8", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number; ToInt8 wraps into signed 8-bit (Int8Array writes).",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
  if (Number.isNaN(number) || number === 0 || !Number.isFinite(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, ±0, or infinite, return +0.",
      description: "Non-finite or zero values map to 0.",
    });
    return F(+0);
  }
  // 3. Let int be truncate(ℝ(number)).
  const int = Math.trunc(number);
  op.log({
    kind: "operation",
    hint: `After truncation: ${int}`,
    description: "Drop fractional part before bit-width wrapping.",
  });
  // 4. Let int8bit be int modulo 2^8.
  const int8bit = mod(int, 2 ** 8);
  // 5. If int8bit ≥ 2^7, return 𝔽(int8bit - 2^8); otherwise return 𝔽(int8bit).
  if (int8bit >= 2 ** 7) {
    const result = int8bit - 2 ** 8;
    op.log({
      kind: "return",
      hint: `Convert to signed int8: ${result}.`,
      description: "Two's-complement: values ≥ 128 wrap into the negative half [-128, -1].",
    });
    return F(result);
  }
  op.log({
    kind: "return",
    hint: `Convert to int8: ${int8bit}.`,
    description: "Value fits in [0, 127] — positive half of int8.",
  });
  return F(int8bit);
}

/** https://tc39.es/ecma262/#sec-touint8 */
export function* ToUint8(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToUint8", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number; ToUint8 wraps into unsigned 8-bit (Uint8Array writes, byte values).",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, +0𝔽, -0𝔽, +∞𝔽, or -∞𝔽, return +0𝔽.
  if (Number.isNaN(number) || number === 0 || !Number.isFinite(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, ±0, or infinite, return +0.",
      description: "Non-finite or zero values map to 0.",
    });
    return F(+0);
  }
  // 3. Let int be truncate(ℝ(number)).
  const int = Math.trunc(number);
  op.log({
    kind: "operation",
    hint: `After truncation: ${int}`,
    description: "Drop fractional part before bit-width wrapping.",
  });
  // 4. Let int8bit be int modulo 2^8.
  const int8bit = mod(int, 2 ** 8);
  // 5. Return 𝔽(int8bit).
  op.log({
    kind: "return",
    hint: `Convert to uint8: ${int8bit & 0xff}.`,
    description: "Modulo 256 — value in [0, 255]. Wrap-around, not clamping (see ToUint8Clamp for clamping).",
  });
  return F(int8bit);
}

/** https://tc39.es/ecma262/#sec-touint8clamp */
export function* ToUint8Clamp(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToUint8Clamp", argument);

  // 1. Let number be ? ToNumber(argument).
  op.log({
    kind: "operation",
    hint: "Call ToNumber.",
    description: "Coerce to Number; ToUint8Clamp clamps (not wraps) to [0, 255] — used by Uint8ClampedArray (image pixel data).",
  });
  const number = R(Q(yield* ToNumber(argument)));
  // 2. If number is NaN, return +0𝔽.
  if (Number.isNaN(number)) {
    op.log({
      kind: "return",
      hint: "Number is NaN, return +0.",
      description: "NaN clamps to 0 by convention.",
    });
    return F(+0);
  }
  // 3. If ℝ(number) ≤ 0, return +0𝔽.
  if (number <= 0) {
    op.log({
      kind: "return",
      hint: "Number ≤ 0, return +0.",
      description: "Negative values clamp to the minimum (0), not wrap.",
    });
    return F(+0);
  }
  // 4. If ℝ(number) ≥ 255, return 255𝔽.
  if (number >= 255) {
    op.log({
      kind: "return",
      hint: "Number ≥ 255, return 255.",
      description: "Values above 255 clamp to the maximum.",
    });
    return F(255);
  }
  // 5. Let f be floor(ℝ(number)).
  const f = Math.floor(number);
  op.log({
    kind: "operation",
    hint: `After floor: ${f}`,
    description: "Floor sets up the rounding decision in following steps.",
  });
  // 6. If f + 0.5 < ℝ(number), return 𝔽(f + 1).
  if (f + 0.5 < number) {
    op.log({
      kind: "return",
      hint: `Round up (nearest value > ${f}.5): ${f + 1}.`,
      description: "Fractional part > 0.5 → round up to nearest integer.",
    });
    return F(f + 1);
  }
  // 7. If ℝ(number) < f + 0.5, return 𝔽(f).
  if (number < f + 0.5) {
    op.log({
      kind: "return",
      hint: `Round down (nearest value < ${f}.5): ${f}.`,
      description: "Fractional part < 0.5 → round down.",
    });
    return F(f);
  }
  // 8. If f is odd, return 𝔽(f + 1).
  if (f % 2 === 1) {
    op.log({
      kind: "return",
      hint: `Round to even (tie, round up): ${f + 1}.`,
      description: "Exact .5 tie — round to even (banker's rounding). f is odd, so f+1 is even.",
    });
    return F(f + 1);
  }
  // 9. Return 𝔽(f).
  op.log({
    kind: "return",
    hint: `Round to even (tie, round down): ${f}.`,
    description: "Exact .5 tie — round to even. f is already even, return it.",
  });
  return F(f);
}

/** https://tc39.es/ecma262/#sec-tobigint */
export function* ToBigInt(argument: Value): ValueEvaluator<BigIntValue> {
  const op = OperationHandle.begin(argument.trace, "ToBigInt", argument);

  // 1. Let prim be ? ToPrimitive(argument, number).
  op.log({
    kind: "operation",
    hint: 'Call ToPrimitive with hint "number".',
    description: 'Reduce to a primitive first. The "number" hint biases objects towards valueOf() (more likely to return a BigInt).',
  });
  const prim = Q(yield* ToPrimitive(argument, "number"));
  // 2. Return the value that prim corresponds to in Table 12 (#table-tobigint).
  if (prim instanceof UndefinedValue) {
    op.log({
      kind: "throw",
      hint: "Cannot convert undefined to BigInt.",
      description: "undefined has no integer interpretation — BigInt requires a meaningful value.",
    });
    // Throw a TypeError exception.
    return surroundingAgent.Throw("TypeError", "CannotConvertToBigInt", prim);
  } else if (prim instanceof NullValue) {
    op.log({
      kind: "throw",
      hint: "Cannot convert null to BigInt.",
      description: "Unlike Number (null → 0), BigInt rejects null to avoid silent coercion in arithmetic.",
    });
    // Throw a TypeError exception.
    return surroundingAgent.Throw("TypeError", "CannotConvertToBigInt", prim);
  } else if (prim instanceof BooleanValue) {
    op.log({
      kind: "operation",
      hint: `Convert boolean ${prim === Value.true ? "true" : "false"} to BigInt.`,
      description: "Booleans map to 0n or 1n — same convention as Number.",
    });
    // Return 1ℤ if prim is true and 0ℤ if prim is false.
    if (prim === Value.true) {
      return Z(1n);
    }
    return Z(0n);
  } else if (prim instanceof BigIntValue) {
    op.log({
      kind: "return",
      hint: "Result is already BigInt, return as-is.",
      description: "Identity case: BigInt stays BigInt.",
    });
    // Return prim.
    return prim;
  } else if (prim instanceof NumberValue) {
    op.log({
      kind: "throw",
      hint: "Cannot convert number to BigInt.",
      description: "Implicit Number → BigInt is forbidden — Number may have fractions or non-integer values. Use BigInt(n) explicitly.",
    });
    // Throw a TypeError exception.
    return surroundingAgent.Throw("TypeError", "CannotConvertToBigInt", prim);
  } else if (prim instanceof JSStringValue) {
    op.log({
      kind: "operation",
      hint: `Parse string "${prim.stringValue()}" as BigInt.`,
      description: 'Strings can be parsed as BigInt literals: "123", "0x1F", etc. Unlike ToNumber, fractional forms are not accepted.',
    });
    // 1. Let n be StringToBigInt(prim).
    const n = StringToBigInt(prim);
    // 2. If n is NaN, throw a SyntaxError exception.
    if (n === undefined) {
      op.log({
        kind: "throw",
        hint: "Invalid BigInt string syntax.",
        description: 'String could not be parsed as an integer literal (e.g. "1.5", "abc"). SyntaxError, not NaN — BigInt has no NaN.',
      });
      return surroundingAgent.Throw("SyntaxError", "CannotConvertToBigInt", prim);
    }
    // 3. Return n.
    op.log({
      kind: "return",
      hint: `String parsed as BigInt ${n.value}.`,
      description: "Parsed integer literal as a BigInt.",
    });
    return n;
  } else if (prim instanceof SymbolValue) {
    op.log({
      kind: "throw",
      hint: "Cannot convert symbol to BigInt.",
      description: "Symbols have unique identity, no numeric interpretation.",
    });
    // Throw a TypeError exception.
    return surroundingAgent.Throw("TypeError", "CannotConvertSymbol", "bigint");
  }
  throw new OutOfRange("ToBigInt", argument);
}

/** https://tc39.es/ecma262/#sec-stringtobigint */
export function StringToBigInt(argument: JSStringValue) {
  try {
    return Z(BigInt(argument.stringValue()));
  } catch {
    return undefined;
  }
}

/** https://tc39.es/ecma262/#sec-tobigint64 */
export function* ToBigInt64(argument: Value): ValueEvaluator<BigIntValue> {
  const op = OperationHandle.begin(argument.trace, "ToBigInt64", argument);

  // 1. Let n be ? ToBigInt(argument).
  op.log({
    kind: "operation",
    hint: "Call ToBigInt.",
    description: "First reduce to BigInt; ToBigInt64 then wraps into signed 64-bit range.",
  });
  const n = Q(yield* ToBigInt(argument));
  // 2. Let int64bit be ℝ(n) modulo 2^64.
  const int64bit = R(n) % 2n ** 64n;
  op.log({
    kind: "operation",
    hint: `After modulo 2^64: ${int64bit}`,
    description: "Reduce to a 64-bit unsigned range before two's-complement interpretation.",
  });
  // 3. If int64bit ≥ 2^63, return ℤ(int64bit - 2^64); otherwise return ℤ(int64bit).
  if (int64bit >= 2n ** 63n) {
    const result = int64bit - 2n ** 64n;
    op.log({
      kind: "return",
      hint: `Convert to signed int64: ${result}.`,
      description: "Two's-complement: values ≥ 2⁶³ map to the negative half of int64.",
    });
    return Z(result);
  }
  op.log({
    kind: "return",
    hint: `Convert to int64: ${int64bit}.`,
    description: "Value fits in the positive half [0, 2⁶³-1].",
  });
  return Z(int64bit);
}

/** https://tc39.es/ecma262/#sec-tobiguint64 */
export function* ToBigUint64(argument: Value): ValueEvaluator<BigIntValue> {
  const op = OperationHandle.begin(argument.trace, "ToBigUint64", argument);

  // 1. Let n be ? ToBigInt(argument).
  op.log({
    kind: "operation",
    hint: "Call ToBigInt.",
    description: "First reduce to BigInt; ToBigUint64 then wraps into unsigned 64-bit range.",
  });
  const n = Q(yield* ToBigInt(argument));
  // 2. Let int64bit be ℝ(n) modulo 2^64.
  const int64bit = R(n) % 2n ** 64n;
  op.log({
    kind: "operation",
    hint: `After modulo 2^64: ${int64bit}`,
    description: "Reduce to the unsigned 64-bit range [0, 2⁶⁴-1].",
  });
  // 3. Return ℤ(int64bit).
  op.log({
    kind: "return",
    hint: `Convert to uint64: ${int64bit}.`,
    description: "Final unsigned 64-bit BigInt.",
  });
  return Z(int64bit);
}

/** https://tc39.es/ecma262/#sec-tostring */
export function* ToString(argument: Value): ValueEvaluator<JSStringValue> {
  const op = OperationHandle.begin(argument.trace, "ToString", argument);

  if (argument instanceof UndefinedValue) {
    const result = Value("undefined");
    op.log(
      {
        kind: "return",
        hint: 'If argument is undefined, return "undefined".',
        description: 'Stringify the literal text "undefined" — matches String(undefined) === "undefined".',
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: 'If argument is undefined, return "undefined".',
      description: "Not undefined — continue.",
    });
  }

  if (argument instanceof NullValue) {
    const result = Value("null");
    op.log(
      {
        kind: "return",
        hint: 'If argument is null, return "null".',
        description: 'String(null) === "null". Mirrors JSON-like serialization for these primitives.',
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: 'If argument is null, return "null".',
      description: "Not null — continue.",
    });
  }

  if (argument instanceof BooleanValue) {
    const boolStr = argument === Value.true ? "true" : "false";
    const result = Value(boolStr);
    op.log(
      {
        kind: "return",
        hint: `If argument is ${boolStr}, return "${boolStr}".`,
        description: 'String(true) === "true", String(false) === "false".',
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: 'If argument is boolean, return "true" or "false".',
      description: "Not boolean — continue.",
    });
  }

  if (argument instanceof NumberValue) {
    op.log({
      kind: "operation",
      hint: `Convert number ${R(argument)} to string.`,
      description: "Number → string uses base-10 by default; NaN, ±Infinity get their canonical strings.",
    });
    const result = X(NumberValue.toString(argument, 10));
    op.log(
      {
        kind: "return",
        hint: `Number::toString(${R(argument)}) = "${result.stringValue()}".`,
        description: "Canonical decimal representation of the number.",
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: "If argument is number, convert using Number::toString.",
      description: "Not a number — continue.",
    });
  }

  if (argument instanceof JSStringValue) {
    op.log(
      {
        kind: "return",
        hint: "Argument is already a string, return as-is.",
        description: "Identity case: string stays string.",
      },
      argument,
    );
    return argument;
  } else {
    op.log({
      kind: "if",
      hint: "If argument is string, return as-is.",
      description: "Not a string — continue.",
    });
  }

  if (argument instanceof SymbolValue) {
    op.log({
      kind: "throw",
      hint: "Cannot convert Symbol to String - throw TypeError.",
      description: "Implicit Symbol → String would silently lose identity. Use String(sym) or sym.toString() explicitly.",
    });
    return surroundingAgent.Throw("TypeError", "CannotConvertSymbol", "string");
  } else {
    op.log({
      kind: "if",
      hint: "If argument is Symbol, throw TypeError.",
      description: "Not a Symbol — continue.",
    });
  }

  if (argument instanceof BigIntValue) {
    op.log({
      kind: "operation",
      hint: `Convert BigInt ${R(argument)} to string.`,
      description: "BigInt → string is base-10 by default. Note: no 'n' suffix in the string form.",
    });
    const result = X(BigIntValue.toString(argument, 10));
    op.log(
      {
        kind: "return",
        hint: `BigInt::toString(${R(argument)}) = "${result.stringValue()}".`,
        description: "Decimal representation of the BigInt.",
      },
      result,
    );
    return result;
  } else {
    op.log({
      kind: "if",
      hint: "If argument is BigInt, convert using BigInt::toString.",
      description: "Not a BigInt — only Object remains.",
    });
  }

  if (argument instanceof ObjectValue) {
    op.log({
      kind: "call",
      hint: 'Step 2g-i: Let primValue be ? ToPrimitive(argument, "string").',
      description: 'Reduce object to a primitive via the string-hinted protocol (toString() first, valueOf() fallback).',
    });
    const primValue = Q(yield* ToPrimitive(argument, "string"));
    op.log({
      kind: "call",
      hint: "Step 2g-ii: Return ? ToString(primValue).",
      description: "Recurse to convert the primitive (may now be number, boolean, etc.) to string.",
    });
    const result = Q(yield* ToString(primValue));
    op.log(
      {
        kind: "return",
        hint: `ToString returned "${result.stringValue()}".`,
        description: "Final string for the original object.",
      },
      result,
    );
    return result;
  }

  throw new OutOfRange("ToString", { argument });
}

/** https://tc39.es/ecma262/#sec-toobject */
export function ToObject(argument: Value): ValueCompletion<ObjectValue> {
  const op = OperationHandle.begin(argument.trace, "ToObject", argument);
  if (argument === Value.undefined) {
    op.log({
      kind: "throw",
      hint: "Step 1: argument is undefined — throw TypeError.",
      description: "undefined has no object wrapper — accessing properties on undefined is a common bug source.",
    });
    return surroundingAgent.Throw("TypeError", "CannotConvertToObject", "undefined");
  } else if (argument === Value.null) {
    op.log({
      kind: "throw",
      hint: "Step 2: argument is null — throw TypeError.",
      description: "null has no object wrapper. (Object(null) interestingly returns a fresh {}, but ToObject(null) throws — different operations.)",
    });
    return surroundingAgent.Throw("TypeError", "CannotConvertToObject", "null");
  } else if (argument instanceof BooleanValue) {
    op.log({
      kind: "return",
      hint: `Step 3: argument is Boolean — return new Boolean object wrapping ${argument === Value.true ? "true" : "false"}.`,
      description: "Box the primitive in a Boolean wrapper object (so property access like (true).toString() works).",
    });
    const obj = OrdinaryObjectCreate(surroundingAgent.intrinsic("%Boolean.prototype%"), [
      "BooleanData",
    ]) as Mutable<BooleanObject>;
    obj.BooleanData = argument;
    return obj;
  } else if (argument instanceof NumberValue) {
    op.log({
      kind: "return",
      hint: `Step 4: argument is Number — return new Number object wrapping ${R(argument)}.`,
      description: "Box the primitive in a Number wrapper — enables (5).toFixed(2) and similar method calls on primitives.",
    });
    const obj = OrdinaryObjectCreate(surroundingAgent.intrinsic("%Number.prototype%"), [
      "NumberData",
    ]) as Mutable<NumberObject>;
    obj.NumberData = argument;
    return obj;
  } else if (argument instanceof JSStringValue) {
    op.log({
      kind: "return",
      hint: `Step 5: argument is String — return new String object wrapping "${argument.stringValue()}".`,
      description: 'Box the primitive in a String wrapper — gives access to length, methods, and indexed chars on string literals.',
    });
    return StringCreate(argument, surroundingAgent.intrinsic("%String.prototype%"));
  } else if (argument instanceof SymbolValue) {
    op.log({
      kind: "return",
      hint: "Step 6: argument is Symbol — return new Symbol object.",
      description: "Box the primitive Symbol in a Symbol wrapper object.",
    });
    const obj = OrdinaryObjectCreate(surroundingAgent.intrinsic("%Symbol.prototype%"), [
      "SymbolData",
    ]) as Mutable<SymbolObject>;
    obj.SymbolData = argument;
    return obj;
  } else if (argument instanceof BigIntValue) {
    op.log({
      kind: "return",
      hint: `Step 7: argument is BigInt — return new BigInt object wrapping ${R(argument)}.`,
      description: "Box the primitive BigInt in a BigInt wrapper object.",
    });
    const obj = OrdinaryObjectCreate(surroundingAgent.intrinsic("%BigInt.prototype%"), [
      "BigIntData",
    ]) as Mutable<BigIntObject>;
    obj.BigIntData = argument;
    return obj;
  }
  Assert(argument instanceof ObjectValue);
  op.log({
    kind: "return",
    hint: "Step 8: argument is already an Object — return as-is.",
    description: "Identity case: objects don't need boxing.",
  });
  return argument;
}

/** https://tc39.es/ecma262/#sec-topropertykey */
export function* ToPropertyKey(argument: Value): ValueEvaluator<PropertyKeyValue> {
  const op = OperationHandle.begin(argument.trace, "ToPropertyKey", argument);

  // 1. Let key be ? ToPrimitive(argument, string).
  op.log({
    kind: "operation",
    hint: 'Call ToPrimitive with hint "string".',
    description: 'Property keys are either Strings or Symbols. The "string" hint biases objects toward producing a string.',
  });
  const key = Q(yield* ToPrimitive(argument, "string"));
  // 2. If Type(key) is Symbol, then
  if (key instanceof SymbolValue) {
    // a. Return key.
    op.log({
      kind: "return",
      hint: "Result is Symbol, return as property key.",
      description: "Symbols are valid property keys directly — no stringification needed.",
    });
    return key;
  }
  // 3. Return ! ToString(key).
  op.log({
    kind: "operation",
    hint: "Convert to string for property key.",
    description: "Non-Symbol primitives become string keys (e.g. number 0 → string '0').",
  });
  return X(ToString(key));
}

/** https://tc39.es/ecma262/#sec-tolength */
export function* ToLength(argument: Value): ValueEvaluator<NumberValue> {
  const op = OperationHandle.begin(argument.trace, "ToLength", argument);

  // 1. Let len be ? ToIntegerOrInfinity(argument).
  op.log({
    kind: "operation",
    hint: "Call ToIntegerOrInfinity.",
    description: "Coerce to integer first; then clamp into the valid array-length range.",
  });
  const len = Q(yield* ToIntegerOrInfinity(argument));
  // 2. If len ≤ 0, return +0𝔽.
  if (len <= 0) {
    op.log({
      kind: "return",
      hint: "Integer is ≤ 0, return +0.",
      description: "Lengths are non-negative — clamp negatives (and zero) to 0.",
    });
    return F(+0);
  }
  // 3. Return 𝔽(min(len, 253 - 1)).
  const maxLength = 2 ** 53 - 1;
  const result = Math.min(len, maxLength);
  op.log({
    kind: "return",
    hint: `Clamp to valid length: ${result}.`,
    description: "Cap at 2⁵³-1 (max safe integer) — that's the largest length JS arrays support.",
  });
  return F(result);
}

/** https://tc39.es/ecma262/#sec-canonicalnumericindexstring */
export function CanonicalNumericIndexString(argument: Value) {
  // 1. Assert: Type(argument) is String.
  Assert(argument instanceof JSStringValue);
  const op = OperationHandle.begin(argument.trace, "CanonicalNumericIndexString", argument);
  op.log({
    kind: "operation",
    value: argument.stringValue(),
    type: "string",
    hint: `Check if "${argument.stringValue()}" is a canonical numeric index.`,
    description: 'A canonical index is the exact string form of a number (e.g. "0", "1", "1.5"). Used to distinguish array-like indices from regular property names.',
  });

  // 2. If argument is "-0", return -0𝔽.
  if (argument.stringValue() === "-0") {
    op.log({
      kind: "return",
      value: "-0",
      type: "number",
      hint: 'String is "-0", return -0.',
      description: '"-0" is a special case — round-trip would lose the sign, so it\'s handled explicitly.',
    });
    return F(-0);
  }
  // 3. Let n be ! ToNumber(argument).
  const n = X(ToNumber(argument));
  // 4. If SameValue(! ToString(n), argument) is false, return undefined.
  const strRep = X(ToString(n));
  if (SameValue(strRep, argument) === Value.false) {
    op.log({
      kind: "return",
      value: "undefined",
      type: "undefined",
      hint: "Number-to-string round-trip failed, not a canonical index.",
      description: 'String → number → string must match the original. E.g. "01" → 1 → "1" ≠ "01" → not canonical (treated as a regular property name, not an index).',
    });
    return Value.undefined;
  }
  // 5. Return n.
  op.log({
    kind: "return",
    value: String(R(n)),
    type: "number",
    hint: `Valid canonical numeric index: ${R(n)}.`,
    description: "Round-trip succeeded — this string is a canonical numeric index.",
  });
  return n;
}

/** https://tc39.es/ecma262/#sec-toindex */
export function* ToIndex(value: Value) {
  const op = OperationHandle.begin(value.trace, "ToIndex", value);

  // 1. If value is undefined, then
  if (value instanceof UndefinedValue) {
    // a. Return 0.
    op.log({
      kind: "return",
      hint: "Value is undefined, return 0 as index.",
      description: "undefined means 'not specified' — default index is 0.",
    });
    return 0;
  } else {
    // a. Let integerIndex be 𝔽(? ToIntegerOrInfinity(value)).
    op.log({
      kind: "operation",
      hint: "Call ToIntegerOrInfinity.",
      description: "Convert to integer; subsequent steps enforce that it's a valid index.",
    });
    const integerIndex = F(Q(yield* ToIntegerOrInfinity(value)));
    // b. If integerIndex < +0𝔽, throw a RangeError exception.
    if (R(integerIndex) < 0) {
      op.log({
        kind: "throw",
        hint: "Index is negative.",
        description: "Indices are non-negative; negative values are explicitly rejected (RangeError, not silent clamp).",
      });
      return surroundingAgent.Throw("RangeError", "NegativeIndex", "Index");
    }
    // c. Let index be ! ToLength(integerIndex).
    op.log({
      kind: "operation",
      hint: "Clamp index to valid length.",
      description: "ToLength caps at 2⁵³-1; SameValue check below catches whether clamping changed the value.",
    });
    const index = X(ToLength(integerIndex));
    // d. If ! SameValue(integerIndex, index) is false, throw a RangeError exception.
    if (X(SameValue(integerIndex, index)) === Value.false) {
      op.log({
        kind: "throw",
        hint: "Index exceeds maximum length.",
        description: "Original was > 2⁵³-1 — ToLength clamped it, so the index is out of the safe range. Reject with RangeError.",
      });
      return surroundingAgent.Throw("RangeError", "OutOfRange", "Index");
    }
    // e. Return ℝ(index).
    op.log({
      kind: "return",
      hint: `Valid index: ${R(index)}.`,
      description: "Index passed all checks (non-negative, ≤ 2⁵³-1).",
    });
    return R(index);
  }
}
