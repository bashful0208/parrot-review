# Login & Register Pages Redesign

**Date:** 2026-05-13
**Status:** Approved
**Author:** Claude (with user input)

---

## Overview

Redesign the login and registration pages with a modern, professional design using shadcn/ui components and GitHub-inspired styling.

## Design Decisions

### Layout: Split Screen

- **Left side (50%):** Brand showcase area with product features
- **Right side (50%):** Form area (login/register)
- **Mobile:** Stacked layout (brand on top, form below)
- **Form max-width:** 320px, centered

### Color Scheme

| Element | Color | Notes |
|---------|-------|-------|
| Brand showcase background | Gradient #1e293b → #0f172a | Deep dark gradient |
| Form background | White | Clean, high contrast |
| Primary button | #238636 | GitHub green |
| Links | #0969da | GitHub blue |
| Borders | #d0d7de | GitHub gray |
| Text (primary) | #1f2328 | Near black |
| Text (secondary) | #656d76 | Gray |

### Components

- Use shadcn/ui components: `Button`, `Input`, `Label`
- Social login buttons: Borderless with icons, horizontal layout
- Divider: Horizontal line with "or" text
- Border radius: 6px (buttons, inputs)

---

## Login Page

### Structure

```
┌─────────────────────────────────────────────────────────┐
│                    LOGIN PAGE                           │
├──────────────────────────┬──────────────────────────────┤
│                          │                              │
│    Brand Showcase         │      Login Form              │
│                          │                              │
│    Code Reviewer         │  [GitHub] [Gitee] [Google]   │
│    AI-Powered Code       │  ──── or ────                │
│    Review Platform       │  Email: [________]           │
│                          │  Password: [________]        │
│    ✓ Intelligent         │         Forgot password?     │
│      code analysis       │  [Sign in]                   │
│    ✓ Multi-language      │                              │
│      support             │  New to Code Reviewer?       │
│    ✓ Real-time           │  Create an account           │
│      collaboration       │                              │
│                          │                              │
└──────────────────────────┴──────────────────────────────┘
```

### Features

1. **Social login buttons:** GitHub, Gitee, Google
2. **Divider:** "or" text between social and email login
3. **Email field:** With label
4. **Password field:** With label, show/hide toggle, "Forgot password?" link
5. **Sign in button:** Full-width, green (#238636), loading state
6. **Create account link:** Below the form

### Behavior

- **Loading state:** Button shows spinner during API call
- **Error handling:** Error message displayed above the form
- **Success:** Redirect to `/` and refresh
- **Forgot password:** Navigate to `/forgot-password`
- **Create account:** Navigate to `/register`

---

## Register Page

### Structure

```
┌─────────────────────────────────────────────────────────┐
│                   REGISTER PAGE                         │
├──────────────────────────┬──────────────────────────────┤
│                          │                              │
│    Brand Showcase         │      Register Form           │
│                          │                              │
│    Code Reviewer         │  Email: [________]           │
│    AI-Powered Code       │  Password: [________]        │
│    Review Platform       │  Must be at least 8 chars    │
│                          │  with uppercase, lowercase,  │
│    ✓ Intelligent         │  and number                  │
│      code analysis       │  Confirm Password: [____]    │
│    ✓ Multi-language      │  [Create an account]         │
│      support             │                              │
│    ✓ Real-time           │  Already have an account?    │
│      collaboration       │  Sign in                     │
│                          │                              │
└──────────────────────────┴──────────────────────────────┘
```

### Features

1. **No social login** (different from login page)
2. **Email field:** With label
3. **Password field:** With label, show/hide toggle, requirements hint
4. **Confirm password field:** With label, show/hide toggle
5. **Create account button:** Full-width, green (#238636), loading state
6. **Sign in link:** Below the form

### Behavior

- **Loading state:** Button shows spinner during API call
- **Error handling:** Error message displayed above the form
- **Validation:** Client-side validation before API call
  - Email: Required, valid format
  - Password: Required, min 8 chars, uppercase, lowercase, number
  - Confirm password: Must match password
- **Success:** Redirect to `/login` with success message
- **Sign in:** Navigate to `/login`

---

## Component Specifications

### Button

- **Primary variant:** Green background (#238636), white text
- **Loading state:** Spinner animation, disabled state
- **Border radius:** 6px
- **Full-width:** Yes (for submit buttons)

### Input

- **Border:** 1px solid #d0d7de
- **Border radius:** 6px
- **Focus state:** Blue border (#0969da)
- **Error state:** Red border (#cf222e)
- **Padding:** 12px

### Label

- **Font size:** 14px
- **Font weight:** 600
- **Color:** #1f2328
- **Margin bottom:** 8px

### Social Login Button

- **Style:** Borderless with icon
- **Border:** 1px solid #d0d7de
- **Border radius:** 6px
- **Icon:** SVG icons (GitHub, Gitee, Google)
- **Layout:** Horizontal, equal width

---

## Responsive Design

### Desktop (≥1024px)

- Split screen layout (50/50)
- Form max-width: 320px
- Brand showcase: Full height

### Tablet (768px - 1023px)

- Split screen layout (50/50)
- Form max-width: 280px
- Brand showcase: Reduced padding

### Mobile (<768px)

- Stacked layout
- Brand showcase: Reduced height (200px)
- Form: Full-width with padding
- Social login buttons: Stack vertically if needed

---

## Accessibility

- **Color contrast:** All text meets WCAG 4.5:1 ratio
- **Focus states:** Visible focus rings on all interactive elements
- **Labels:** All form fields have associated labels
- **Error messages:** Announced to screen readers via aria-live
- **Keyboard navigation:** Full keyboard support

---

## Implementation Notes

### Files to Modify

1. `apps/web/src/app/login/page.tsx` - Login page layout
2. `apps/web/src/app/register/page.tsx` - Register page layout
3. `apps/web/src/components/auth/LoginForm.tsx` - Login form component
4. `apps/web/src/components/auth/RegisterForm.tsx` - Register form component
5. `apps/web/src/components/auth/SocialLoginGroup.tsx` - Social login buttons
6. `apps/web/src/components/auth/Divider.tsx` - Divider component

### Dependencies

- shadcn/ui components: `Button`, `Input`, `Label`
- Lucide icons: `Github`, `GitBranch`, `Mail`, `Lock`, `Eye`, `EyeOff`
- Existing auth logic (no changes needed)

### Design Tokens

Use existing shadcn/ui CSS variables for consistency:
- `--background` / `--foreground`
- `--primary` / `--primary-foreground`
- `--border`
- `--muted` / `--muted-foreground`

---

## Open Questions

None - all design decisions have been approved by the user.

---

## Next Steps

1. Create implementation plan
2. Update login page with new design
3. Update register page with new design (no social login)
4. Test responsive behavior
5. Verify accessibility
