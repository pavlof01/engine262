import { F } from "../index.mts";
import { OperationHandle } from "../trace-builder.mts";
import type { Value } from "../value.mts";

/** https://tc39.es/ecma262/#sec-runtime-semantics-mv-s */
//   StringNumericLiteral :::
//     [empty]
//     StrWhiteSpace
//     StrWhiteSpace_opt StrNumericLiteral StrWhiteSpace_opt
export function MV_StringNumericLiteral(StringNumericLiteral: string, traceSource?: Value) {
  const numericValue = Number(StringNumericLiteral);
  const result = F(numericValue);

  if (traceSource) {
    result.trace = traceSource.trace;
    const op = OperationHandle.begin(result.trace, "StringToNumber", result, [`"${StringNumericLiteral}"`]);

    op.log({ kind: "operation", hint: `Step 1: Let text be StringToCodePoints("${StringNumericLiteral}").` });
    op.log({ kind: "operation", hint: `Step 2: Let literal be ParseText(text, |StringNumericLiteral|).` });

    if (isNaN(numericValue)) {
      op.log({
        kind: "if",
        hint: `Step 3: literal is a List of errors — "${StringNumericLiteral}" cannot be parsed as a numeric literal.`,
        taken: true,
      });
      op.log({ kind: "return", hint: `Step 3: Return *NaN*.` }, result);
    } else {
      op.log({
        kind: "if",
        hint: `Step 3: literal is not a List of errors — string parsed successfully.`,
        taken: false,
      });
      op.log({ kind: "operation", hint: `Step 4: Let mv be the MV of literal = ${numericValue}.` });
      const mvStr = isFinite(numericValue) ? String(numericValue) : numericValue > 0 ? "+∞" : "-∞";
      op.log({
        kind: "assert",
        hint: `Step 5: Assert: mv (${mvStr}) is a finite Mathematical value or +∞ or -∞.`,
      });
      op.log({ kind: "return", hint: `Step 6: Return 𝔽(mv) = ${mvStr}.` }, result);
    }
  }

  return result;
}
