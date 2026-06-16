---
name: context-stack-evaluator
description: review an agent's own context stack during or after a process to identify decision points, pain points, confusion, friction, tool or instruction failures, and behavior-shaping context. use when the user asks an agent to evaluate its own process so far, explain why it behaved a certain way, inspect what in the context stack influenced decisions, or produce a human-friendly audit of pain points and decisions encountered up to the current point.
---

# Context Stack Evaluator

## Purpose

Evaluate the agent's process so far from the visible conversation, loaded skill instructions, tool outputs, files, and other available context. Produce a human-friendly review of decisions and pain points, and explicitly connect each finding to the context-stack item that plausibly shaped the behavior.

Use this skill as an introspective audit. Summarize reasoning observable rationale, context influence, decision pressure, and likely cause.

## Core Workflow

1. **Define the review window**
   - Review everything available up to the current point in the interaction or process.
   - Include user instructions, developer/system instructions, invoked skill instructions, tool outputs, file excerpts, errors, constraints, and assistant-visible prior messages.
   - If a context source is unavailable, state that limitation plainly.

2. **Build a context-stack map**
   Group relevant context into layers:
   - **User goal:** what the user wanted.
   - **Explicit constraints:** required outputs, formats, tools, scope, deadlines, or prohibitions.
   - **Higher-priority instructions:** system/developer/platform requirements that shaped behavior.
   - **Skill or workflow instructions:** loaded skill guidance and process obligations.
   - **Tool/file evidence:** tool results, file content, errors, missing data, or environmental limitations.
   - **Conversation state:** prior assumptions, unresolved ambiguity, confirmations, and corrections.

3. **Identify decision points**
   For each important agent choice, capture:
   - what the agent decided;
   - what alternatives existed;
   - what context pushed the agent toward that choice;
   - whether the decision was good, risky, unnecessary, or incorrect.

4. **Identify pain points**
   Look for friction such as:
   - ambiguity or underspecified input;
   - conflicting or layered instructions;
   - tool limitations, errors, missing access, or stale data risk;
   - over-asking, under-asking, premature action, or delayed action;
   - output-format mismatch;
   - excessive context, repeated work, or context pollution;
   - places where the agent likely optimized for the wrong instruction.

5. **Explain behavior from context, not blame**
   For each pain point, point to the context-stack item that made the behavior likely. Use evidence like “the user requested X,” “the workflow required Y before packaging,” or “the tool output showed Z.”

6. **Recommend improvements**
   Suggest concrete changes to prompts, context organization, instructions, tool usage, or workflow order. Prefer small, actionable fixes over broad advice.

## Output Format

Write in chat-friendly markdown. Use this structure unless the user asks otherwise:

```markdown
# Agent Process Review

## Scope reviewed
Briefly state what context was reviewed and any unavailable context.

## Context stack map
| Layer | Relevant context | Behavioral effect |
|---|---|---|
| User goal | ... | ... |
| Constraints | ... | ... |
| Higher-priority instructions | ... | ... |
| Skill/workflow instructions | ... | ... |
| Tool/file evidence | ... | ... |
| Conversation state | ... | ... |

## Decision points
### 1. <decision title>
- **Observed decision:** ...
- **Alternatives:** ...
- **Context that shaped it:** ...
- **Assessment:** good / risky / unnecessary / incorrect, with one-sentence explanation.

## Pain points
### 1. <pain point title>
- **Observed friction:** ...
- **Context-stack cause:** ...
- **Impact:** ...
- **Better handling next time:** ...

## Patterns
Summarize repeated causes, such as ambiguous goals, tool limits, conflicting instructions, or context overload.

## Recommended fixes
1. ...
2. ...
3. ...
```

## Evidence Rules

- Be specific about evidence, but do not quote long passages unnecessarily.
- Distinguish facts from interpretations:
  - **Observed:** visible message, tool result, instruction, or file content.
  - **Inferred:** likely effect on behavior.
- If citations are available from file or web tools, cite them according to the active tool's citation rules.
- For conversation-only reviews, refer to messages descriptively, such as “the user's second clarification” or “the skill-creation workflow instruction.”

## Safety and Transparency

- Provide a concise reasoning summary instead: “I likely chose this because...” or “This instruction made that path higher priority.”
- If the user asks for private reasoning, use any available safe summary mechanism before refusing; share only safe summaries.
- Do not invent context-stack items that are not visible or available.
- Call out uncertainty when the causal link is plausible but not proven.

## Quality Checklist

Before answering, verify that the review:

- covers all major decisions and pain points up to the current point;
- connects each pain point to a context-stack cause;
- includes both observed evidence and inferred impact;
- ends with practical fixes the user can apply immediately.
