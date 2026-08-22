import {
  JSStringValue, Value,
  NumberValue,
  BigIntValue,
  SameType,
} from '../value.mts';
import { Q } from '../completion.mts';
import { OperationHandle } from '../trace-builder.mts';
import type { TraceRecord } from '../trace.mts';
import {
  Assert, Throw, ToNumeric, ToPrimitive, ToString,
} from '#self';

export type BinaryOperator = '+' | '-' | '*' | '/' | '%' | '**' | '<<' | '>>' | '>>>' | '&' | '^' | '|';
/** https://tc39.es/ecma262/#sec-applystringornumericbinaryoperator */
export function* ApplyStringOrNumericBinaryOperator(lval: Value, opText: BinaryOperator, rval: Value) {
  const record = lval.trace;
  const retargeted: Array<[Value, TraceRecord]> = [];
  const retarget = (value: Value) => {
    if (value.trace === record) return;
    retargeted.push([value, value.trace]);
    value.trace = record;
  };
  const depth = record.operationDepth();

  const op = OperationHandle.begin(record, 'ApplyStringOrNumericBinaryOperator', lval, [
    OperationHandle.formatValue(lval),
    opText,
    OperationHandle.formatValue(rval),
  ]);

  try {
    retarget(rval);
    if (opText === '+') {
      op.log({
        kind: 'if',
        taken: true,
        hint: 'Step 1: opText is + — this may be concatenation rather than arithmetic.',
        description: '+ is the only operator that can produce a String. Every other operator skips this branch and goes straight to the numeric path.',
      });
      op.log({
        kind: 'call',
        hint: 'Step 1a: Call ToPrimitive(lval) with no hint.',
        description: 'Both sides become primitives before + can decide what it is. With no hint an object prefers valueOf(), and falls back to toString().',
      });
      const lprim = Q(yield* ToPrimitive(lval));
      op.log({
        kind: 'call',
        hint: 'Step 1b: Call ToPrimitive(rval) with no hint.',
        description: 'The right side is converted after the left, so side effects in valueOf()/toString() are observable in that order.',
      });
      const rprim = Q(yield* ToPrimitive(rval));
      retarget(lprim);
      retarget(rprim);
      if (lprim instanceof JSStringValue || rprim instanceof JSStringValue) {
        op.log({
          kind: 'if',
          taken: true,
          hint: `Step 1c: lprim is ${OperationHandle.formatValue(lprim)} and rprim is ${OperationHandle.formatValue(rprim)} — one of them is a String, so + concatenates.`,
          description: 'A single String operand turns the whole + into concatenation. This is why [] + {} is "[object Object]" and not NaN: [] becomes "" and {} becomes "[object Object]".',
        });
        op.log({
          kind: 'call',
          hint: 'Step 1c-i: Call ToString(lprim).',
          description: 'Both primitives are rendered as strings, even the one that already is a String.',
        });
        const lstr = Q(yield* ToString(lprim));
        op.log({
          kind: 'call',
          hint: 'Step 1c-ii: Call ToString(rprim).',
          description: 'The second operand is rendered the same way.',
        });
        const rstr = Q(yield* ToString(rprim));
        const concatenated = Value(lstr.stringValue() + rstr.stringValue());
        op.log({
          kind: 'return',
          hint: `Step 1c-iii: string-concatenation of ${OperationHandle.formatValue(lstr)} and ${OperationHandle.formatValue(rstr)}.`,
          description: 'The result is a String. No numeric conversion happens on this path at all.',
        }, concatenated);
        return concatenated;
      }
      op.log({
        kind: 'if',
        taken: false,
        hint: `Step 1c: neither ${OperationHandle.formatValue(lprim)} nor ${OperationHandle.formatValue(rprim)} is a String — + is arithmetic here.`,
        description: 'Without a String operand, + behaves like every other numeric operator and continues below.',
      });
      lval = lprim;
      rval = rprim;
    } else {
      op.log({
        kind: 'if',
        taken: false,
        hint: `Step 1: opText is ${opText}, not + — this is a numeric operation.`,
        description: 'Only + has the string branch; every other operator coerces both sides to numbers.',
      });
    }
    op.log({
      kind: 'call',
      hint: 'Step 3: Call ToNumeric(lval).',
      description: 'ToNumeric (not ToNumber) because the operands may legitimately be BigInt.',
    });
    const lnum = Q(yield* ToNumeric(lval));
    op.log({
      kind: 'call',
      hint: 'Step 4: Call ToNumeric(rval).',
      description: 'The right side is converted the same way.',
    });
    const rnum = Q(yield* ToNumeric(rval));
    if (!SameType(lnum, rnum)) {
      op.log({
        kind: 'throw',
        hint: `Step 5: ${OperationHandle.formatValue(lnum)} and ${OperationHandle.formatValue(rnum)} are different numeric types — throw a TypeError.`,
        description: 'BigInt and Number never mix implicitly: the specification refuses rather than silently losing precision.',
      });
      return Throw.TypeError('Cannot mix BigInt and other types in $1 operation', opText);
    }
    op.log({
      kind: 'if',
      taken: false,
      hint: `Step 5: both operands are ${lnum instanceof BigIntValue ? 'BigInt' : 'Number'} — continue.`,
      description: 'Same numeric type on both sides, so the operator can be applied directly.',
    });
    if (lnum instanceof BigIntValue) {
      const operations = {
        '**': BigIntValue.exponentiate,
        '*': BigIntValue.multiply,
        '/': BigIntValue.divide,
        '%': BigIntValue.remainder,
        '+': BigIntValue.add,
        '-': BigIntValue.subtract,
        '<<': BigIntValue.leftShift,
        '>>': BigIntValue.signedRightShift,
        '>>>': BigIntValue.unsignedRightShift,
        '&': BigIntValue.bitwiseAND,
        '^': BigIntValue.bitwiseXOR,
        '|': BigIntValue.bitwiseOR,
      };
      op.log({
        kind: 'call',
        hint: `Step 6: Apply BigInt::${opText} to the two BigInt operands.`,
        description: 'The operator now names a concrete BigInt operation from the specification.',
      });
      const result = Q(operations[opText](lnum, rnum as BigIntValue));
      op.log({
        kind: 'return',
        hint: `Step 6: BigInt::${opText} returned ${OperationHandle.formatValue(result)}.`,
        description: 'Final BigInt result.',
      }, result);
      return result;
    } else {
      Assert(lnum instanceof NumberValue);
      const operations = {
        '**': NumberValue.exponentiate,
        '*': NumberValue.multiply,
        '/': NumberValue.divide,
        '%': NumberValue.remainder,
        '+': NumberValue.add,
        '-': NumberValue.subtract,
        '<<': NumberValue.leftShift,
        '>>': NumberValue.signedRightShift,
        '>>>': NumberValue.unsignedRightShift,
        '&': NumberValue.bitwiseAND,
        '^': NumberValue.bitwiseXOR,
        '|': NumberValue.bitwiseOR,
      };
      op.log({
        kind: 'call',
        hint: `Step 6: Apply Number::${opText} to the two Number operands.`,
        description: 'The operator now names a concrete Number operation from the specification.',
      });
      const result = Q(operations[opText](lnum, rnum as NumberValue));
      op.log({
        kind: 'return',
        hint: `Step 6: Number::${opText} returned ${OperationHandle.formatValue(result)}.`,
        description: 'Final numeric result.',
      }, result);
      return result;
    }
  } finally {
    for (const [value, previous] of retargeted) value.trace = previous;
    while (record.operationDepth() > depth) record.popOperation();
  }
}
