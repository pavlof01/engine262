import {
  BigIntValue,
  BooleanValue, NullValue, UndefinedValue,
  SymbolValue,
  JSStringValue,
  NumberValue,
  ObjectValue,
  Value,
  wellKnownSymbols,
} from '../value.mts';
import { surroundingAgent } from '../host-defined/engine.mts';
import { Q, X, type ValueEvaluator } from '../completion.mts';
import { OperationHandle } from '../trace-builder.mts';
import {
  Assert,
  Get,
  ToBoolean,
  ToNumber,
  ToNumeric,
  ToPrimitive,
  StringToBigInt,
  isProxyExoticObject,
  isArrayExoticObject, R,
  SameType,
  type FunctionObject,
  type PropertyKeyValue,
} from '#self';

function valueTypeName(v: Value): string {
  if (v instanceof UndefinedValue) return 'undefined';
  if (v instanceof NullValue) return 'null';
  if (v instanceof BooleanValue) return 'Boolean';
  if (v instanceof NumberValue) return 'Number';
  if (v instanceof JSStringValue) return 'String';
  if (v instanceof BigIntValue) return 'BigInt';
  if (v instanceof SymbolValue) return 'Symbol';
  if (v instanceof ObjectValue) return 'Object';
  return 'Value';
}

// This file covers abstract operations defined in
/** https://tc39.es/ecma262/#sec-testing-and-comparison-operations */

/** https://tc39.es/ecma262/#sec-requireobjectcoercible */
export function RequireObjectCoercible(argument: Value) {
  if (argument === Value.undefined) {
    return surroundingAgent.Throw('TypeError', 'CannotConvertToObject', 'undefined');
  }
  if (argument === Value.null) {
    return surroundingAgent.Throw('TypeError', 'CannotConvertToObject', 'null');
  }
  return undefined;
}

/** https://tc39.es/ecma262/#sec-isarray */
export function IsArray(argument: Value) {
  if (!(argument instanceof ObjectValue)) {
    return Value.false;
  }
  if (isArrayExoticObject(argument)) {
    return Value.true;
  }
  if (isProxyExoticObject(argument)) {
    if (argument.ProxyHandler === Value.null) {
      return surroundingAgent.Throw('TypeError', 'ProxyRevoked', 'IsArray');
    }
    const target = argument.ProxyTarget;
    return IsArray(target);
  }
  return Value.false;
}

/** https://tc39.es/ecma262/#sec-iscallable */
export function IsCallable(argument: Value): argument is FunctionObject {
  if (!(argument instanceof ObjectValue)) {
    return false;
  }
  if ('Call' in argument) {
    return true;
  }
  return false;
}

/** https://tc39.es/ecma262/#sec-isconstructor */
export function IsConstructor(argument: Value): argument is FunctionObject {
  if (!(argument instanceof ObjectValue)) {
    return false;
  }
  if ('Construct' in argument) {
    return true;
  }
  return false;
}

/** https://tc39.es/ecma262/#sec-isextensible-o */
export function* IsExtensible(O: ObjectValue) {
  Assert(O instanceof ObjectValue);
  return yield* O.IsExtensible();
}

/** https://tc39.es/ecma262/#sec-isinteger */
export function IsIntegralNumber(argument: Value) {
  if (!(argument instanceof NumberValue)) {
    return Value.false;
  }
  if (argument.isNaN() || argument.isInfinity()) {
    return Value.false;
  }
  if (Math.floor(Math.abs(R(argument))) !== Math.abs(R(argument))) {
    return Value.false;
  }
  return Value.true;
}

/** https://tc39.es/ecma262/#sec-ispropertykey */
export function IsPropertyKey(argument: unknown): argument is PropertyKeyValue {
  if (argument instanceof JSStringValue) {
    return true;
  }
  if (argument instanceof SymbolValue) {
    return true;
  }
  return false;
}

/** https://tc39.es/ecma262/#sec-isregexp */
export function* IsRegExp(argument: Value): ValueEvaluator<BooleanValue> {
  if (!(argument instanceof ObjectValue)) {
    return Value.false;
  }
  const matcher = Q(yield* Get(argument, wellKnownSymbols.match));
  if (matcher !== Value.undefined) {
    return ToBoolean(matcher);
  }
  if ('RegExpMatcher' in argument) {
    return Value.true;
  }
  return Value.false;
}

/** https://tc39.es/ecma262/#sec-isstringprefix */
export function IsStringPrefix(p: JSStringValue, q: JSStringValue) {
  Assert(p instanceof JSStringValue);
  Assert(q instanceof JSStringValue);
  return q.stringValue().startsWith(p.stringValue());
}

/** https://tc39.es/ecma262/#sec-samevalue */
export function SameValue(x: Value, y: Value) {
  // If SameType(x, y) is false, return false.
  if (!SameType(x, y)) {
    return Value.false;
  }
  // If x is a Number, then
  if (x instanceof NumberValue) {
    // a. Return Number::sameValue(x, y).
    return NumberValue.sameValue(x, y as NumberValue);
  }
  // 3. Return SameValueNonNumber(x, y).
  return X(SameValueNonNumber(x, y));
}

/** https://tc39.es/ecma262/#sec-samevaluezero */
export function SameValueZero(x: Value, y: Value) {
  // 1. If SameType(x, y) is false, return false.
  if (!SameType(x, y)) {
    return Value.false;
  }
  // 2. If x is a Number, then
  if (x instanceof NumberValue) {
    // a. Return Number::sameValueZero(x, y).
    return NumberValue.sameValueZero(x, y as NumberValue);
  }
  // 3. Return SameValueNonNumber(x, y).
  return SameValueNonNumber(x, y);
}

/** https://tc39.es/ecma262/#sec-samevaluenonnumber */
export function SameValueNonNumber(x: Value, y: Value) {
  Assert(SameType(x, y));

  if (x instanceof UndefinedValue || x instanceof NullValue) {
    return Value.true;
  }

  if (x instanceof BigIntValue) {
    return BigIntValue.equal(x, y as BigIntValue);
  }

  if (x instanceof JSStringValue) {
    if (x.stringValue() === (y as JSStringValue).stringValue()) {
      return Value.true;
    }
    return Value.false;
  }

  if (x instanceof BooleanValue) {
    if (x === y) {
      return Value.true;
    }
    return Value.false;
  }

  return x === y ? Value.true : Value.false;
}

/** https://tc39.es/ecma262/#sec-abstract-relational-comparison */
export function* AbstractRelationalComparison(x: Value, y: Value, LeftFirst = true): ValueEvaluator<BooleanValue | UndefinedValue> {
  const op = OperationHandle.begin(x.trace, 'AbstractRelationalComparison', x, [
    OperationHandle.formatValue(x),
    OperationHandle.formatValue(y),
  ]);
  let px;
  let py;
  // 1. If the LeftFirst flag is true, then
  if (LeftFirst === true) {
    // a. Let px be ? ToPrimitive(x, number).
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 1: LeftFirst is true — evaluate ToPrimitive in left-to-right order.',
      description: '< operator evaluates left side first; preserved here to match observable side effects from getters / valueOf().',
    });
    // a. Let px be ? ToPrimitive(x, number).
    op.log({
      kind: 'call',
      hint: 'Step 1a: Let px be ? ToPrimitive(x, number).',
      description: 'Coerce left operand to primitive with number hint — relational ops want numeric semantics where possible.',
    });
    px = Q(yield* ToPrimitive(x, 'number'));
    // b. Let py be ? ToPrimitive(y, number).
    op.log({
      kind: 'call',
      hint: 'Step 1b: Let py be ? ToPrimitive(y, number).',
      description: 'Coerce right operand to primitive.',
    });
    py = Q(yield* ToPrimitive(y, 'number'));
  } else {
    op.log({
      kind: 'if',
      taken: false,
      hint: 'Step 2: LeftFirst is false — reverse evaluation order.',
      description: 'Used when called with operands swapped (e.g. for >). Spec keeps left-to-right effects.',
    });
    // a. NOTE: The order of evaluation needs to be reversed to preserve left to right evaluation.
    // b. Let py be ? ToPrimitive(y, number).
    py = Q(yield* ToPrimitive(y, 'number'));
    // c. Let px be ? ToPrimitive(x, number).
    px = Q(yield* ToPrimitive(x, 'number'));
  }
  // 3. If Type(px) is String and Type(py) is String, then
  if (px instanceof JSStringValue && py instanceof JSStringValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 3: both primitives are Strings — compare lexicographically (code-unit order).',
      description: 'String-vs-String uses UTF-16 code-unit comparison, not numeric. E.g. "10" < "2" is true.',
    });
    // a. If IsStringPrefix(py, px) is true, return false.
    if (IsStringPrefix(py, px)) {
      op.log({
        kind: 'return',
        hint: 'Step 3a: py is a prefix of px → return false.',
        description: 'If right is a prefix of left, left is longer or equal — not less.',
      }, Value.false);
      return Value.false;
    }
    // b. If IsStringPrefix(px, py) is true, return true.
    if (IsStringPrefix(px, py)) {
      op.log({
        kind: 'return',
        hint: 'Step 3b: px is a prefix of py → return true.',
        description: 'Left is a strict prefix of right — left is "less than" right.',
      }, Value.true);
      return Value.true;
    }
    // c. Let k be the smallest nonnegative integer such that the code unit at index k within px
    //    is different from the code unit at index k within py. (There must be such a k, for
    //    neither String is a prefix of the other.)
    let k = 0;
    while (true) {
      if (px.stringValue()[k] !== py.stringValue()[k]) {
        break;
      }
      k += 1;
    }
    // d. Let m be the integer that is the numeric value of the code unit at index k within px.
    const m = px.stringValue().charCodeAt(k);
    // e. Let n be the integer that is the numeric value of the code unit at index k within py.
    const n = py.stringValue().charCodeAt(k);
    // f. If m < n, return true. Otherwise, return false.
    const lt = m < n;
    op.log({
      kind: 'return',
      hint: `Step 3f: first differing code unit at index ${k}: ${m} vs ${n} → ${lt ? 'true' : 'false'}.`,
      description: 'Compare code units at the first index where strings differ. Code-unit values determine ordering.',
    }, lt ? Value.true : Value.false);
    return lt ? Value.true : Value.false;
  } else {
    op.log({
      kind: 'if',
      taken: false,
      hint: 'Step 4: at least one operand is not a String — numeric comparison path.',
      description: 'When operands are not both strings, coerce both to numerics (Number or BigInt) and compare numerically.',
    });
    // a. If Type(px) is BigInt and Type(py) is String, then
    if (px instanceof BigIntValue && py instanceof JSStringValue) {
      // i. Let ny be StringToBigInt(py).
      const ny = StringToBigInt(py);
      // ii. If ny is undefined, return undefined.
      if (ny === undefined) {
        op.log({
          kind: 'return',
          hint: 'Step 4a: BigInt < String, but StringToBigInt(py) is undefined → return undefined.',
          description: 'Strings that cannot be parsed as BigInt make the comparison undefined (NaN-like → result of < is false).',
        }, Value.undefined);
        return Value.undefined;
      }
      // iii. Return BigInt::lessThan(px, ny).
      const r = BigIntValue.lessThan(px, ny);
      op.log({
        kind: 'return',
        hint: `Step 4a: BigInt::lessThan(px, ny) = ${r === Value.true ? 'true' : 'false'}.`,
        description: 'BigInt-vs-parsed-BigInt comparison.',
      }, r);
      return r;
    }
    // b. If Type(px) is String and Type(py) is BigInt, then
    if (px instanceof JSStringValue && py instanceof BigIntValue) {
      // i. Let ny be StringToBigInt(py).
      const nx = StringToBigInt(px);
      // ii. If ny is undefined, return undefined.
      if (nx === undefined) {
        op.log({
          kind: 'return',
          hint: 'Step 4b: String < BigInt, but StringToBigInt(px) is undefined → return undefined.',
          description: 'Symmetric to 4a — unparseable string makes comparison undefined.',
        }, Value.undefined);
        return Value.undefined;
      }
      // iii. Return BigInt::lessThan(px, ny).
      const r = BigIntValue.lessThan(nx, py);
      op.log({
        kind: 'return',
        hint: `Step 4b: BigInt::lessThan(nx, py) = ${r === Value.true ? 'true' : 'false'}.`,
        description: 'Parsed-BigInt-vs-BigInt comparison.',
      }, r);
      return r;
    }
    // c. Let nx be ? ToNumeric(px). NOTE: Because px and py are primitive values evaluation order is not important.
    op.log({
      kind: 'call',
      hint: 'Step 4c: Let nx be ? ToNumeric(px).',
      description: 'Coerce left primitive to Number or BigInt.',
    });
    const nx = Q(yield* ToNumeric(px));
    // d. Let ny be ? ToNumeric(py).
    op.log({
      kind: 'call',
      hint: 'Step 4d: Let ny be ? ToNumeric(py).',
      description: 'Coerce right primitive to Number or BigInt.',
    });
    const ny = Q(yield* ToNumeric(py));
    // e. If Type(nx) is the same as Type(ny), return Type(nx)::lessThan(nx, ny).
    if (SameType(nx, ny)) {
      if (nx instanceof NumberValue) {
        op.log({
          kind: 'call',
          hint: 'Step 4e: Return Number::lessThan(nx, ny).',
          description: 'Both numerics are Numbers — delegate to Number::lessThan (NaN → undefined, signed-zero-aware).',
        });
        const r = NumberValue.lessThan(nx, ny as NumberValue);
        op.log({
          kind: 'return',
          hint: `Step 4e: Number::lessThan(nx, ny) = ${r === Value.true ? 'true' : (r === Value.false ? 'false' : 'undefined')}.`,
          description: 'Both numerics are Numbers — direct numeric comparison (NaN → undefined).',
        }, r);
        return r;
      } else {
        Assert(nx instanceof BigIntValue);
        const r = BigIntValue.lessThan(nx, ny as BigIntValue);
        op.log({
          kind: 'return',
          hint: `Step 4e: BigInt::lessThan(nx, ny) = ${r === Value.true ? 'true' : 'false'}.`,
          description: 'Both numerics are BigInts — exact integer comparison.',
        }, r);
        return r;
      }
    }
    // f. Assert: Type(nx) is BigInt and Type(ny) is Number, or Type(nx) is Number and Type(ny) is BigInt.
    Assert((nx instanceof BigIntValue && ny instanceof NumberValue) || (nx instanceof NumberValue && ny instanceof BigIntValue));
    // g. If nx or ny is NaN, return undefined.
    if ((nx.isNaN && nx.isNaN()) || (ny.isNaN && ny.isNaN())) {
      op.log({
        kind: 'return',
        hint: 'Step 4g: one operand is NaN → return undefined.',
        description: 'Any comparison involving NaN is undefined; < then yields false.',
      }, Value.undefined);
      return Value.undefined;
    }
    // h. If nx is -∞ or ny is +∞, return true.
    if ((nx instanceof NumberValue && R(nx) === -Infinity) || (ny instanceof NumberValue && R(ny) === +Infinity)) {
      op.log({
        kind: 'return',
        hint: 'Step 4h: nx is -∞ or ny is +∞ → return true.',
        description: 'Infinity bounds short-circuit cross-numeric comparison.',
      }, Value.true);
      return Value.true;
    }
    // i. If nx is +∞ or ny is -∞, return false.
    if ((nx instanceof NumberValue && R(nx) === +Infinity) || (ny instanceof NumberValue && R(ny) === -Infinity)) {
      op.log({
        kind: 'return',
        hint: 'Step 4i: nx is +∞ or ny is -∞ → return false.',
        description: 'Infinity bounds short-circuit cross-numeric comparison.',
      }, Value.false);
      return Value.false;
    }
    // j. If the mathematical value of nx is less than the mathematical value of ny, return true; otherwise return false.
    const a = R(nx);
    const b = R(ny);
    const lt = a < b;
    op.log({
      kind: 'return',
      hint: `Step 4j: mathematical values ${a} < ${b} → ${lt ? 'true' : 'false'}.`,
      description: 'Compare mathematical values across the BigInt/Number boundary (loses precision for very large BigInts converted to Number).',
    }, lt ? Value.true : Value.false);
    return lt ? Value.true : Value.false;
  }
}

/** https://tc39.es/ecma262/#sec-islooselyequal */
export function* IsLooselyEqual(x: Value, y: Value): ValueEvaluator<BooleanValue> {
  const op = OperationHandle.begin(x.trace, 'IsLooselyEqual', x, [
    OperationHandle.formatValue(x),
    OperationHandle.formatValue(y),
  ]);
  const tx = valueTypeName(x);
  const ty = valueTypeName(y);

  // 1. If SameType(x, y) is true, then
  if (SameType(x, y)) {
    op.log({
      kind: 'if',
      taken: true,
      hint: `Step 1: Type(x) is ${tx} and Type(y) is ${ty} — same type, defer to IsStrictlyEqual.`,
      description: 'Loose equality with same-type operands behaves identically to strict equality — no coercion needed.',
    });
    // a. Return the result of performing Strict Equality Comparison x === y.
    op.log({
      kind: 'call',
      hint: 'Step 1a: Return the result of IsStrictlyEqual(x, y).',
      description: 'Strict equality path — identical types compared directly.',
    });
    const r = IsStrictlyEqual(x, y);
    op.log({
      kind: 'return',
      hint: `Step 1a: IsStrictlyEqual(x, y) = ${r === Value.true ? 'true' : 'false'}.`,
      description: 'Result propagated from strict equality.',
    }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: `Step 1: Type(x) is ${tx}, Type(y) is ${ty} — different types, continue.`,
    description: 'The two sides are different types, so strict comparison cannot decide this — one of the coercion rules below has to.',
  });

  // 2. If x is null and y is undefined, return true.
  if (x === Value.null && y === Value.undefined) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 2: x is null and y is undefined → return true.',
      description: 'Loose equality treats null and undefined as equal to each other (but to nothing else). Famous null == undefined quirk.',
    });
    op.log({
      kind: 'return',
      hint: 'Step 2: return true.',
      description: 'null == undefined is a special-case rule of loose equality.',
    }, Value.true);
    return Value.true;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 2: not (x is null and y is undefined) — skip.',
    description: 'This is not the null == undefined pair, so that special rule does not fire.',
  });

  // 3. If x is undefined and y is null, return true.
  if (x === Value.undefined && y === Value.null) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 3: x is undefined and y is null → return true.',
      description: 'Symmetric counterpart of Step 2 — undefined == null.',
    });
    op.log({
      kind: 'return',
      hint: 'Step 3: return true.',
      description: 'Symmetric null/undefined rule.',
    }, Value.true);
    return Value.true;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 3: not (x is undefined and y is null) — skip.',
    description: 'Not the mirrored undefined == null pair either.',
  });

  // 4. If Type(x) is Number and Type(y) is String, return the result of the comparison x == ! ToNumber(y).
  if (x instanceof NumberValue && y instanceof JSStringValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 4: x is Number, y is String — coerce y via ToNumber.',
      description: 'Number-vs-String comparisons coerce the string side to a number. E.g. 1 == "1" → 1 == 1.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 4: Recurse IsLooselyEqual(x, ToNumber(y)).',
      description: 'Recurse with both sides as Number — next call falls into Step 1 same-type path.',
    });
    const r = X(yield* IsLooselyEqual(x, X(ToNumber(y))));
    op.log({ kind: 'return', hint: `Step 4: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 4: not (x is Number and y is String) — skip.',
    description: 'Not a Number facing a String — no string-to-number coercion on the right side.',
  });

  // 5. If Type(x) is String and Type(y) is Number, return the result of the comparison ! ToNumber(x) == y.
  if (x instanceof JSStringValue && y instanceof NumberValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 5: x is String, y is Number — coerce x via ToNumber.',
      description: 'Symmetric of Step 4: "1" == 1 → 1 == 1.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 5: Recurse IsLooselyEqual(ToNumber(x), y).',
      description: 'Recurse with both sides as Number.',
    });
    const r = X(yield* IsLooselyEqual(X(ToNumber(x)), y));
    op.log({ kind: 'return', hint: `Step 5: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 5: not (x is String and y is Number) — skip.',
    description: 'Not a String facing a Number — the mirrored coercion does not apply either.',
  });

  // 6. If Type(x) is BigInt and Type(y) is String, then
  if (x instanceof BigIntValue && y instanceof JSStringValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 6: x is BigInt, y is String — parse y as BigInt.',
      description: 'BigInt vs String: parse the string as a BigInt literal. Fail → not equal.',
    });
    // a. Let n be StringToBigInt(y).
    const n = StringToBigInt(y);
    // b. If n is undefined, return false.
    if (n === undefined) {
      op.log({
        kind: 'if',
        taken: true,
        hint: 'Step 6b: StringToBigInt(y) is undefined.',
        description: 'String could not be parsed as integer literal.',
      });
      op.log({
        kind: 'return',
        hint: 'Step 6b: return false.',
        description: 'Unparseable string is not equal to any BigInt.',
      }, Value.false);
      return Value.false;
    }
    op.log({
      kind: 'if',
      taken: false,
      hint: 'Step 6b: StringToBigInt(y) succeeded.',
      description: 'Parsed BigInt available — recurse with both sides as BigInt.',
    });
    // c. Return the result of the comparison x == n.
    op.log({
      kind: 'call',
      hint: 'Step 6c: Recurse IsLooselyEqual(x, n).',
      description: 'Recurse with both sides as BigInt — Step 1 same-type path fires next.',
    });
    const r = X(yield* IsLooselyEqual(x, n));
    op.log({ kind: 'return', hint: `Step 6: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 6: not (x is BigInt and y is String) — skip.',
    description: 'Not a BigInt facing a String, so there is nothing to parse as a BigInt literal.',
  });

  // 7. If Type(x) is String and Type(y) is BigInt, return the result of the comparison y == x.
  if (x instanceof JSStringValue && y instanceof BigIntValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 7: x is String, y is BigInt — swap operands to use Step 6.',
      description: 'Reduce to the BigInt-vs-String case by swapping arguments.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 7: Recurse IsLooselyEqual(y, x).',
      description: 'Operands swapped — falls into Step 6 path.',
    });
    const r = X(yield* IsLooselyEqual(y, x));
    op.log({ kind: 'return', hint: `Step 7: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 7: not (x is String and y is BigInt) — skip.',
    description: 'Not a String facing a BigInt — the mirrored parse rule does not apply.',
  });

  // 8. If Type(x) is Boolean, return the result of the comparison ! ToNumber(x) == y.
  if (x instanceof BooleanValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 8: x is Boolean — coerce x via ToNumber.',
      description: 'Booleans coerced to numbers: true → 1, false → 0. Source of "true == 1" being true.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 8: Recurse IsLooselyEqual(ToNumber(x), y).',
      description: 'x is now Number — further coercion depends on y.',
    });
    const r = X(yield* IsLooselyEqual(X(ToNumber(x)), y));
    op.log({ kind: 'return', hint: `Step 8: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 8: x is not Boolean — skip.',
    description: 'x is not a Boolean, so there is nothing to unwrap to 0/1 on the left.',
  });

  // 9. If Type(y) is Boolean, return the result of the comparison x == ! ToNumber(y).
  if (y instanceof BooleanValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 9: y is Boolean — coerce y via ToNumber.',
      description: 'Symmetric of Step 8. The motivating example {} == ![] triggers this once ![] is evaluated to false.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 9: Recurse IsLooselyEqual(x, ToNumber(y)).',
      description: 'y is now Number — next call applies object-vs-primitive coercion (Step 11) if x is an Object.',
    });
    const r = X(yield* IsLooselyEqual(x, X(ToNumber(y))));
    op.log({ kind: 'return', hint: `Step 9: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 9: y is not Boolean — skip.',
    description: 'y is not a Boolean either — no 0/1 unwrapping on the right.',
  });

  // 10. If Type(x) is either String, Number, BigInt, or Symbol and Type(y) is Object, return the result of the comparison x == ToPrimitive(y).
  if ((x instanceof JSStringValue || x instanceof NumberValue || x instanceof BigIntValue || x instanceof SymbolValue) && y instanceof ObjectValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: `Step 10: x is ${tx}, y is Object — coerce y via ToPrimitive.`,
      description: 'Object-vs-primitive: reduce object to a primitive (default hint, biased toward Number). After reduction, recurse.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 10: Recurse IsLooselyEqual(x, ToPrimitive(y)).',
      description: 'After ToPrimitive(y), recurse — likely matches Step 1 or a type-specific coercion case.',
    });
    const r = X(yield* IsLooselyEqual(x, Q(yield* ToPrimitive(y))));
    op.log({ kind: 'return', hint: `Step 10: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 10: not (x is primitive and y is Object) — skip.',
    description: 'Not a primitive facing an Object — the right side does not need ToPrimitive.',
  });

  // 11. If Type(x) is Object and Type(y) is either String, Number, BigInt, or Symbol, return the result of the comparison ToPrimitive(x) == y.
  if (x instanceof ObjectValue && (y instanceof JSStringValue || y instanceof NumberValue || y instanceof BigIntValue || y instanceof SymbolValue)) {
    op.log({
      kind: 'if',
      taken: true,
      hint: `Step 11: x is Object, y is ${ty} — coerce x via ToPrimitive.`,
      description: 'Symmetric of Step 10. Reduce object side to a primitive, then recurse.',
    });
    op.log({
      kind: 'call',
      hint: 'Step 11: Recurse IsLooselyEqual(ToPrimitive(x), y).',
      description: 'Reduce object to primitive, then recurse.',
    });
    const r = X(yield* IsLooselyEqual(Q(yield* ToPrimitive(x)), y));
    op.log({ kind: 'return', hint: `Step 11: result = ${r === Value.true ? 'true' : 'false'}.`, description: 'Final loose-equality result.' }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 11: not (x is Object and y is primitive) — skip.',
    description: 'Not an Object facing a primitive — the left side does not need ToPrimitive.',
  });

  // 12. If Type(x) is BigInt and Type(y) is Number, or if Type(x) is Number and Type(y) is BigInt, then
  if ((x instanceof BigIntValue && y instanceof NumberValue) || (x instanceof NumberValue && y instanceof BigIntValue)) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 12: cross-numeric BigInt-vs-Number comparison.',
      description: 'BigInt and Number can be loosely equal if they represent the same mathematical value (e.g. 1n == 1). Special handling avoids precision loss.',
    });
    // a. If x or y are any of NaN, +∞, or -∞, return false.
    if ((x.isNaN && (x.isNaN() || !x.isFinite())) || (y.isNaN && (y.isNaN() || !y.isFinite()))) {
      op.log({
        kind: 'if',
        taken: true,
        hint: 'Step 12a: x or y is NaN or ±∞.',
        description: 'BigInt cannot represent NaN or infinity.',
      });
      op.log({
        kind: 'return',
        hint: 'Step 12a: return false.',
        description: 'Non-finite Number is not equal to any BigInt.',
      }, Value.false);
      return Value.false;
    }
    op.log({
      kind: 'if',
      taken: false,
      hint: 'Step 12a: both x and y are finite non-NaN — compare mathematical values.',
      description: 'Both operands have well-defined mathematical values.',
    });
    // b. If the mathematical value of x is equal to the mathematical value of y, return true; otherwise return false.
    const a = R(x);
    const b = R(y);
    const eq = a == b; // eslint-disable-line eqeqeq
    op.log({
      kind: 'return',
      hint: `Step 12b: math values ${a} == ${b} → ${eq ? 'true' : 'false'}.`,
      description: 'Compare mathematical values across the BigInt/Number boundary.',
    }, eq ? Value.true : Value.false);
    return eq ? Value.true : Value.false;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 12: not a BigInt/Number cross-numeric pair — skip.',
    description: 'Not a BigInt against a Number — the last cross-numeric rule is out too.',
  });

  // 13. Return false.
  op.log({
    kind: 'return',
    hint: 'Step 13: No coercion rule applied → return false.',
    description: 'Types remained incompatible after all rules — values are not loosely equal (e.g. Symbol vs Number).',
  }, Value.false);
  return Value.false;
}

/** https://tc39.es/ecma262/#sec-isstrictlyequal */
export function IsStrictlyEqual(x: Value, y: Value) {
  const op = OperationHandle.begin(x.trace, 'IsStrictlyEqual', x, [
    OperationHandle.formatValue(x),
    OperationHandle.formatValue(y),
  ]);
  const tx = valueTypeName(x);
  const ty = valueTypeName(y);
  // 1. If SameType(x, y) is false, return false.
  if (!SameType(x, y)) {
    op.log({
      kind: 'if',
      taken: true,
      hint: `Step 1: Type(x) is ${tx} but Type(y) is ${ty} — different types.`,
      description: 'Strict equality requires same type — no coercion.',
    });
    op.log({
      kind: 'return',
      hint: 'Step 1: return false.',
      description: 'Different types are never strictly equal.',
    }, Value.false);
    return Value.false;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: `Step 1: Type(x) is ${tx} and Type(y) is ${ty} — same type, continue.`,
    description: 'Both operands are the same type, so they can be compared directly.',
  });

  // 2. If x is a Number, then
  if (x instanceof NumberValue) {
    op.log({
      kind: 'if',
      taken: true,
      hint: 'Step 2: x is Number — delegate to Number::equal.',
      description: 'Number comparison has special NaN rule: NaN !== NaN. Handled by Number::equal.',
    });
    // a. Return Number::equal(x, y).
    op.log({
      kind: 'call',
      hint: 'Step 2a: Return Number::equal(x, y).',
      description: 'Delegate numeric comparison to Number::equal (NaN-aware, signed-zero-aware).',
    });
    const r = NumberValue.equal(x, y as NumberValue);
    op.log({
      kind: 'return',
      hint: `Step 2a: Number::equal(x, y) = ${r === Value.true ? 'true' : 'false'}.`,
      description: 'Result from numeric equality (NaN-aware).',
    }, r);
    return r;
  }
  op.log({
    kind: 'if',
    taken: false,
    hint: 'Step 2: x is not Number — skip.',
    description: 'The operands are not Numbers, so no NaN or ±0 special cases apply.',
  });

  // 3. Return SameValueNonNumber(x, y).
  op.log({
    kind: 'call',
    hint: 'Step 3: Return SameValueNonNumber(x, y).',
    description: 'Non-numeric same-type values: BigInt → numeric equal; String → char-by-char; Object/Symbol → reference identity.',
  });
  const r = SameValueNonNumber(x, y);
  op.log({
    kind: 'return',
    hint: `Step 3: SameValueNonNumber(x, y) = ${r === Value.true ? 'true' : 'false'}.`,
    description: 'Final strict-equality result.',
  }, r);
  return r;
}
