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

    op.log({
      kind: "operation",
      hint: `Step 1: Let literal be ParseText("${StringNumericLiteral}", |StringNumericLiteral|).`,
      description: "The string is parsed as a numeric literal, which is a grammar production — not the same grammar JavaScript source uses, so \"0x10\" parses but \"010\" is decimal.",
    });

    if (isNaN(numericValue)) {
      op.log({
        kind: "if",
        hint: `Step 2: literal is a List of errors — "${StringNumericLiteral}" is not a numeric literal.`,
        taken: true,
        description: "A string that does not parse becomes NaN here rather than throwing.",
      });
      op.log({ kind: "return", hint: `Step 2: Return *NaN*.` }, result);
    } else {
      op.log({
        kind: "if",
        hint: `Step 2: literal is not a List of errors — the string parsed.`,
        taken: false,
      });
      const valueStr = isFinite(numericValue) ? String(numericValue) : numericValue > 0 ? "+∞" : "-∞";
      op.log({
        kind: "return",
        hint: `Step 3: Return the StringNumericValue of literal = ${valueStr}.`,
        description: "StringNumericValue is the syntax-directed operation that turns the parsed literal into a Number.",
      }, result);
    }
  }

  return result;
}
