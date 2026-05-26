# Button Guidelines

This document defines a small, shared button standard for the frontend.

## Scope

Applies to all interactive button variants in the auth frontend:
- Primary buttons
- Ghost buttons
- Danger buttons
- Reaction and moderation buttons

## State Model

Every button should support the same state language:
- Default: Resting appearance, clearly readable label.
- Hover: Visual lift or contrast increase only when interactive.
- Active: Pressed feedback on click or tap.
- Disabled: Lower emphasis, no pointer interactions.
- Loading: Temporarily non-interactive with progress feedback.

Implementation notes:
- Hover and active styles must not run on disabled or loading buttons.
- Disabled and loading buttons should not trigger new actions.
- Loading state should keep the button width stable to prevent layout shift.

## Accessibility

Use these rules consistently:
- Keep button labels action-based and short (for example: Save, Publish, Join).
- Provide visible keyboard focus using focus-visible styles.
- Mark busy actions with aria-busy set to true.
- Keep disabled semantic state by using the disabled attribute when possible.
- Ensure text contrast remains readable in all states.

## Naming Rules

Use a simple, predictable naming system:
- Base variants: btn-primary, btn-ghost, btn-danger
- State helper: is-loading
- Context classes may be appended for layout only, for example: community-comment-form__submit

Naming guidance:
- Variant classes define visual style.
- State classes define behavior or temporary status.
- Context classes should not override core button state behavior.

## Do and Avoid

Do:
- Reuse shared variants before creating a new one.
- Apply the same loading and disabled logic across pages.
- Keep button height and spacing consistent in a section.

Avoid:
- Inlining one-off button state styles in JSX.
- Creating page-specific hover logic that conflicts with global rules.
- Using icon-only buttons without a clear accessible label.

## Team Checklist

Before merging UI changes, confirm:
- Button uses a shared variant.
- Hover and active are blocked in disabled/loading states.
- Loading action sets aria-busy and blocks repeated submissions.
- Focus-visible remains visible and unobstructed.
