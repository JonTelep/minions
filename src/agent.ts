/**
 * Agent - Executes tasks via the Anthropic Messages API
 *
 * Each agent call sends a focused prompt to the Anthropic API.
 * The orchestrator feeds it ONLY:
 * 1. Its specific task description
 * 2. Relevant blackboard context
 * 3. Tool usage instructions
 * 4. Expected output format
 *
 * Results are parsed and written to the blackboard.
 */

import type { AgentResult, BlackboardEntry, Tool } from './types.js';

const AGENT_SYSTEM = `You are a focused agent in an orchestration system. You have ONE task to complete.

## Rules
1. Complete ONLY the task described below — nothing else
2. Use the provided tools when helpful
3. Write your findings/results as structured JSON
4. Be thorough but concise — quality over quantity
5. If you can't complete the task, explain why clearly

## Output Format
When done, output a JSON block with your results:
\`\`\`json
{
  "success": true,
  "data": { ... your findings/output ... },
  "entries": [
    {
      "key": "descriptive_key",
      "value": { ... },
      "tags": ["relevant", "tags"],
      "entity_ids": ["optional_entity_ids"]
    }
  ],
  "artifacts": [
    {
      "name": "output.md",
      "content_type": "text/markdown",
      "content": "..."
    }
  ],
  "confidence": 0.85
}
\`\`\``;

/**
 * Strip the "anthropic/" prefix that .env uses (e.g. "anthropic/claude-sonnet-4-20250514"
 * becomes "claude-sonnet-4-20250514" which is what the API expects).
 */
function resolveModel(raw?: string): string {
  const model = raw || process.env.DEFAULT_MODEL || 'claude-sonnet-4-20250514';
  return model.replace(/^anthropic\//, '');
}

/**
 * Build the full prompt for an agent
 */
export function buildAgentPrompt(
  role: string,
  description: string,
  context: BlackboardEntry[],
  tools: Tool[],
): string {
  let prompt = `# Agent: ${role}\n\n`;
  prompt += `## Your Task\n${description}\n\n`;

  // Add relevant context from blackboard (minimal)
  if (context.length > 0) {
    prompt += `## Context from Prior Agents\n`;
    for (const entry of context) {
      const valueStr = typeof entry.value === 'string'
        ? entry.value
        : JSON.stringify(entry.value, null, 2);
      // Truncate large values
      const truncated = valueStr.length > 2000
        ? valueStr.slice(0, 2000) + '\n... (truncated)'
        : valueStr;
      prompt += `### ${entry.key} (by ${entry.written_by})\n`;
      prompt += `Tags: ${entry.tags.join(', ')}\n`;
      prompt += `\`\`\`json\n${truncated}\n\`\`\`\n\n`;
    }
  }

  // Add tool instructions
  if (tools.length > 0) {
    prompt += `## Available Tools\n`;
    for (const tool of tools) {
      prompt += `### ${tool.name}\n${tool.usage}\n\n`;
    }
  }

  prompt += `## Output\nRespond with a JSON result block as described in your system instructions.\n`;

  return prompt;
}

/**
 * Execute an agent via the Anthropic Messages API
 */
export async function executeAgent(
  prompt: string,
  opts?: {
    model?: string;
    timeout?: number;
    workdir?: string;
  }
): Promise<AgentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const model = resolveModel(opts?.model);
  const timeoutSec = opts?.timeout || 300;

  console.log(`[Agent] Calling Anthropic API with model: ${model}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: AGENT_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API ${response.status}: ${body}`);
    }

    const json = await response.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    // Extract text from response content blocks
    const text = json.content
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join('\n');

    if (!text) {
      throw new Error('Anthropic API returned no text content');
    }

    console.log(`[Agent] Got ${text.length} chars response`);

    return parseAgentOutput(text);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log(`[Agent] Request timed out after ${timeoutSec}s`);
      return {
        success: false,
        data: null,
        entries: [],
        artifacts: [],
        confidence: 0,
        error: `Agent timed out after ${timeoutSec}s`,
      };
    }

    console.log(`[Agent] API call failed: ${error.message}`);
    return {
      success: false,
      data: null,
      entries: [],
      artifacts: [],
      confidence: 0,
      error: `Agent execution failed: ${error.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse agent output, extracting JSON result block
 */
function parseAgentOutput(output: string): AgentResult {
  // Try to find JSON block in output
  const jsonMatch = output.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch?.[1]) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // Continue to fallback
    }
  }

  // Try to parse entire output as JSON
  try {
    const parsed = JSON.parse(output.trim());
    // Handle claude CLI JSON output format
    if (parsed.result) {
      // Try to extract JSON from the result text
      const resultJsonMatch = String(parsed.result).match(/```json\s*([\s\S]*?)```/);
      if (resultJsonMatch?.[1]) {
        try {
          return JSON.parse(resultJsonMatch[1].trim());
        } catch {
          // Use raw result
        }
      }
      return {
        success: true,
        data: parsed.result,
        entries: [],
        artifacts: [],
        confidence: 0.5,
      };
    }
    return parsed;
  } catch {
    // Return raw output as data
    return {
      success: true,
      data: output.trim(),
      entries: [],
      artifacts: [],
      confidence: 0.3,
    };
  }
}
