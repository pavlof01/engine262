/**
 * Hierarchical tracing for ECMAScript algorithms
 * Provides clean separation between operations (nodes) and steps (within operations)
 */

import {
  Value,
  NumberValue, JSStringValue, BooleanValue, NullValue,
  UndefinedValue, SymbolValue, BigIntValue, ObjectValue,
} from './value.mts';
import type { TraceRecord, TraceStep } from './trace.mts';
import { R } from './abstract-ops/spec-types.mts';

/**
 * OperationHandle — scoped handle for a single algorithm invocation.
 *
 * Replaces the `createTraceEntryFromValue` closure pattern with a proper class.
 * Owns the lifetime of one TraceRecord operation (push on construction, pop on
 * the first return/throw step).
 *
 * Usage:
 *   const op = OperationHandle.begin(argument.trace, 'ToNumeric', argument);
 *   op.log({ kind: 'call', hint: 'Call ToPrimitive' });
 *   op.log({ kind: 'return' }, result);  // auto-closes the operation
 */
export class OperationHandle {
  private constructor(private readonly record: TraceRecord) {}

  /**
   * Open a new operation on `record` and return a handle for logging its steps.
   * `inputs` defaults to `[OperationHandle.formatValue(argument)]`.
   */
  static begin(
    record: TraceRecord,
    algoId: string,
    argument: Value,
    inputs?: string[],
  ): OperationHandle {
    record.pushOperation(algoId, inputs ?? [OperationHandle.formatValue(argument)]);
    return new OperationHandle(record);
  }

  /**
   * Serialize a Value to a human-readable display string for the UI.
   * Formerly the module-level private `valueToDisplayString`.
   */
  static formatValue(v: Value): string {
    if (v instanceof UndefinedValue) return 'undefined';
    if (v instanceof NullValue) return 'null';
    if (v instanceof BooleanValue) return v === Value.true ? 'true' : 'false';
    if (v instanceof NumberValue) {
      const n = R(v);
      if (Number.isNaN(n)) return 'NaN';
      if (!isFinite(n)) return n > 0 ? '+∞' : '-∞';
      return String(n);
    }
    if (v instanceof JSStringValue) return `"${v.stringValue()}"`;
    if (v instanceof SymbolValue) return 'Symbol()';
    if (v instanceof BigIntValue) return `${R(v)}n`;
    // ObjectValue — serialize up to 3 own string-keyed data properties
    if (v instanceof ObjectValue) {
      const parts: string[] = [];
      for (const [key, desc] of v.properties.entries()) {
        if (!(key instanceof JSStringValue)) continue;
        const propName = key.stringValue();
        let propVal = '…';
        if (desc.Value !== undefined) {
          const dv = desc.Value;
          if (dv instanceof UndefinedValue) propVal = 'undefined';
          else if (dv instanceof NullValue) propVal = 'null';
          else if (dv instanceof BooleanValue) propVal = dv === Value.true ? 'true' : 'false';
          else if (dv instanceof NumberValue) propVal = String(R(dv));
          else if (dv instanceof JSStringValue) propVal = `"${dv.stringValue()}"`;
          else if (dv instanceof BigIntValue) propVal = `${R(dv)}n`;
          else if ('SourceText' in dv && typeof (dv as { SourceText: unknown }).SourceText === 'string') {
            propVal = ((dv as { SourceText: string }).SourceText).trim();
          } else {
            propVal = '{…}';
          }
        } else if (desc.Get !== undefined) {
          propVal = 'get …';
        }
        parts.push(`${propName}: ${propVal}`);
      }
      return parts.length === 0 ? '{}' : `{ ${parts.join(', ')} }`;
    }
    return '{…}';
  }

  /**
   * Log one step of the current operation.
   *
   * Optional `returnValue` is the actual ECMAScript Value returned by the step;
   * when provided, `OperationHandle.formatValue` is applied and the result is
   * stored as both `value` and `output` on the step and on the operation node.
   *
   * Automatically closes the operation on `kind: 'return'` or `kind: 'throw'`.
   */
  log(step: TraceStep, returnValue?: Value): void {
    const stepOutput = "output" in step ? step.output : undefined;
    const computedOutput =
      returnValue !== undefined ? OperationHandle.formatValue(returnValue) : stepOutput;

    switch (step.kind) {
      case 'return': {
        this.record.addStep({
          ...step,
          value: computedOutput ?? step.value,
          output: computedOutput,
        });
        this.record.popOperation(computedOutput);
        return;
      }
      case 'throw': {
        this.record.addStep({ ...step });
        if (step.error) this.record.setError(step.error);
        this.record.popOperation();
        return;
      }
      case 'operation': {
        this.record.addStep({
          ...step,
          value: computedOutput ?? step.value,
          output: computedOutput,
        });
        return;
      }
      case 'call': {
        this.record.addStep({ ...step, output: computedOutput ?? step.output });
        return;
      }
      default: {
        this.record.addStep({ ...step });
      }
    }
  }
}
