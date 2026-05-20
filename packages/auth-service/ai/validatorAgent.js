// packages/auth-service/ai/validatorAgent.js
// Validates the AI response before it is returned to the frontend.
//
// Current checks (skeleton):
//   ✓ Response is a non-empty string
//
// Planned expansions (TODO):
//   • Hallucination check — verify bold/quoted titles exist in platform data
//   • Safety filter     — reject off-topic or unsafe content
//   • Grounding score   — measure how well the answer is anchored to platform data

/**
 * Validate an AI-generated response.
 *
 * @param {string} response - the text returned by the answer agent
 * @returns {{ valid: boolean, reason: string | null }}
 */
export function validate(response) {
  if (response == null || typeof response !== 'string') {
    return { valid: false, reason: 'Response is not a string.' };
  }

  if (response.trim().length === 0) {
    return { valid: false, reason: 'Response is blank.' };
  }

  // TODO: hallucination check against known platform titles
  // TODO: safety / off-topic filter
  // TODO: minimum length guard (< 10 chars is likely useless)

  return { valid: true, reason: null };
}
