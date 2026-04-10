/**
 * TraceStepKind - kinds of steps within an operation
 */
export type TraceStepKind = "if" | "operation" | "call" | "return" | "throw" | "assert" | "note";

/** Fields shared by every step variant. */
export interface TraceStepBase {
  /** Human-readable hint or description */
  hint?: string;
  /** Detailed description */
  description?: string;
}

/** Conditional branch step. `taken` records whether the condition was met. */
export interface IfStep extends TraceStepBase {
  kind: "if";
  /** true = condition was met (taken), false = not taken (skipped). */
  taken?: boolean;
  /** Stringified value being examined by the condition. */
  value?: string;
  /** Type name of the examined value. */
  type?: string;
}

/** Spec-level assertion (no runtime value). */
export interface AssertStep extends TraceStepBase {
  kind: "assert";
}

/** Free-form annotation, no runtime effect. */
export interface NoteStep extends TraceStepBase {
  kind: "note";
}

/** Inline operation / let-binding step. */
export interface OperationStep extends TraceStepBase {
  kind: "operation";
  /** Value representation. */
  value?: string;
  /** Type name (e.g., "number", "string", "object"). */
  type?: string;
  /** Output value as human-readable string. */
  output?: string;
  /** Input values as human-readable strings. */
  inputs?: string[];
}

/** Return step — closes the current operation. */
export interface ReturnStep extends TraceStepBase {
  kind: "return";
  value?: string;
  type?: string;
  output?: string;
}

/** Throw step — closes the current operation with an error. */
export interface ThrowStep extends TraceStepBase {
  kind: "throw";
  error?: string;
}

/**
 * Call step — embeds an invoked sub-algorithm directly via
 * `algoId`, `inputs`, `steps`, `output`, `error`.
 */
export interface CallStep extends TraceStepBase {
  kind: "call";
  algoId?: string;
  inputs?: string[];
  steps?: TraceStep[];
  output?: string;
  error?: string;
}

/**
 * TraceStep — discriminated union over `kind`.
 * Use `step.kind === "x"` to narrow to the variant's fields.
 */
export type TraceStep =
  | IfStep
  | AssertStep
  | NoteStep
  | OperationStep
  | ReturnStep
  | ThrowStep
  | CallStep;

/**
 * TraceNode - represents an operation in the algorithm execution tree.
 * Sub-algorithm invocations are nested directly inside `steps[i]` when `kind === "call"`,
 * not as a separate `children` array.
 */
export interface TraceNode {
  /** Algorithm identifier (e.g., "ToNumber", "ToPrimitive") */
  algoId: string;

  /** Input values for the operation */
  inputs: string[];

  /** Output value (set when operation completes) */
  output?: string;

  /** Error if operation threw */
  error?: string;

  /** Steps within this operation (call-kind steps embed sub-algorithms) */
  steps: TraceStep[];
}

/**
 * TraceRecord - hierarchical trace recorder for algorithm execution
 * Tracks nested operations as a tree with global step numbering
 */
export class TraceRecord {
  private root: TraceNode | undefined = undefined;

  private stack: TraceNode[] = [];

  /** Parallel to `stack`: the call-kind step in the parent that triggered each pushed node, or null for the root. */
  private triggerStepStack: (CallStep | null)[] = [];

  /**
   * Get the current operation (top of stack)
   */
  private getCurrentNode(): TraceNode | undefined {
    return this.stack[this.stack.length - 1];
  }

  /**
   * Create a new operation node
   */
  private createNode(algoId: string, inputs: string[] = []): TraceNode {
    return {
      algoId,
      inputs,
      steps: [],
    };
  }

  /**
   * Push a new operation onto the stack.
   * If a parent exists, attach the new operation to the parent's most recent
   * `kind: "call"` step (sharing the steps array by reference). Otherwise push as root.
   */
  pushOperation(algoId: string, inputs: string[] = []): TraceNode {
    const node = this.createNode(algoId, inputs);
    const parent = this.getCurrentNode();
    let triggerStep: CallStep | null = null;

    if (parent) {
      for (let i = parent.steps.length - 1; i >= 0; i--) {
        const candidate = parent.steps[i];
        if (candidate.kind === "call") {
          triggerStep = candidate;
          triggerStep.algoId = algoId;
          triggerStep.inputs = inputs;
          triggerStep.steps = node.steps;
          break;
        }
      }
    } else {
      this.root = node;
    }

    this.stack.push(node);
    this.triggerStepStack.push(triggerStep);
    return node;
  }

  /**
   * Pop the current operation. If `output` is provided, set it on the node and
   * propagate to the triggering call-step (if any) so flat consumers see the result.
   */
  popOperation(output?: string): TraceNode | undefined {
    const node = this.stack.pop();
    const triggerStep = this.triggerStepStack.pop();
    if (node && output !== undefined) {
      node.output = output;
      if (triggerStep) triggerStep.output = output;
    }
    return node;
  }

  /**
   * Add a step to the current operation
   * Auto-creates implicit root if no current operation exists
   */
  addStep(stepData: TraceStep): TraceStep {
    let current = this.getCurrentNode();

    // Auto-create implicit root operation if none exists
    if (!current) {
      this.pushOperation("UnknownOperation", []);
      current = this.getCurrentNode()!;
    }

    const step: TraceStep = { ...stepData };
    current.steps.push(step);
    return step;
  }

  /**
   * Set error on current operation. Also propagates to the triggering call-step
   * (if any) so the embedded representation reflects the failure.
   */
  setError(error: string): void {
    const current = this.getCurrentNode();
    if (current) {
      current.error = error;
      const triggerStep = this.triggerStepStack[this.triggerStepStack.length - 1];
      if (triggerStep) triggerStep.error = error;
    }
  }

  /**
   * Check if trace is empty
   */
  isEmpty(): boolean {
    return this.root === undefined;
  }

  /**
   * Clear all trace data and reset counters
   */
  clear(): void {
    this.root = undefined;
    this.stack = [];
    this.triggerStepStack = [];
  }

  /**
   * Get the root operation
   */
  getRoot(): TraceNode | undefined {
    return this.root;
  }

  /**
   * Get JSON representation
   */
  toJSON(): object {
    return {
      root: this.root,
    };
  }
}

/**
 * TraceEntry - backward compatibility type alias
 * Maps to TraceNode for existing code that references this type
 */
export type TraceEntry = TraceNode;
