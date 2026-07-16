# Project-Based Notes
- Keep README.md up to date.
- All the details are in the .md files in the “/docs” folder. 

# AGENTS.md

This file contains binding rules for all AI coding agents working on this project.

The rules in this file take priority in every task. Before working on any file, folder, module, component, style, API, helper function, or feature, these rules must be taken into account.

---

# 1. General Working Rules

Before starting any new work, the existing project structure must be understood first.

The AI agent must evaluate the following before writing code directly:

* Existing file and folder structure
* Component structure
* Architectural approach
* Coding standards
* Naming conventions
* Styling/CSS approach
* Repeated structures
* Existing helper functions
* Existing types, interfaces, and models
* General language and writing style of the project

Every newly added structure must be:

* Modular
* Optimized
* Clean
* Readable
* Scalable
* Easy to maintain
* Compatible with the existing architecture
* Free from unnecessary complexity

Do not add unnecessary abstraction. Do not create a complex architecture for a problem that can be solved simply.

Minimize code duplication. Before adding a new component, helper, class, or function that performs the same job, check whether an existing equivalent already exists in the project.

---

# 2. Planning Requirement

Before adding a new folder, file, code block, component, module, feature, or major change, a short but clear plan must be created.

The plan must answer the following questions:

* Which files will be changed?
* Will any new files be added?
* How will the change be integrated without breaking the existing structure?
* Is a reusable structure required?
* Can an existing component or helper be used?
* Is the change compatible with the general architecture of the project?

No large-scale change should be made without a plan.

---

# 3. Rules for Modifying Existing Code

If existing code will be extended, edited, or changed with a new feature, the relevant infrastructure must be analyzed first.

The AI agent must follow these steps:

1. Review the relevant files.
2. Understand the existing architecture.
3. Check coding standards and naming conventions.
4. Search whether similar structures already exist in the project.
5. Apply the correct solution with the smallest reasonable change.
6. Make sure existing behavior is not broken.

Always:

* Preserve standardization
* Maintain consistency
* Do not reduce overall code quality
* Do not break the existing component structure
* Do not add unnecessary dependencies
* Do not create unnecessary files or folders

Newly written code must be fully compatible with the existing structure and style of the project.

---

# 4. Component Usage Rules

The component structure must be preserved.

If a UI element is used in multiple places, the same structure should not be recreated repeatedly with different `id`, `class`, inline style, or duplicated HTML/CSS.

For example, repeated structures such as:

* Card
* Button
* Modal
* Input
* Form group
* Badge
* Header
* Section
* Layout wrapper
* Empty state
* Loading state

should be turned into reusable components whenever possible.

Instead of copying the same visual structure across different pages, reusable components should be preferred.

When creating a component:

* The name must be clear
* It must have a single responsibility
* It must not receive unnecessary props
* It must not be designed too generically or too specifically
* It must follow the existing component standards of the project

---

# 5. CSS and Styling Rules

When writing styles, the existing styling approach must be preserved.

The project’s current system must be followed, such as:

* CSS
* SCSS
* CSS Modules
* Tailwind
* Styled Components
* Global CSS
* Utility class structure

A new styling approach must not be introduced outside the existing system.

Styling rules:

* Avoid unnecessary inline styles
* Do not write the same style repeatedly
* Class names must be meaningful
* Component-based styles must be preserved
* Do not make unnecessary changes to global styles
* Do not break responsive behavior
* Preserve the existing spacing, color, font, and layout system

---

# 6. File and Folder Structure Rules

When adding a new file or folder, the existing project structure must be followed.

Before adding a new file:

* Check where similar files are located
* The file name must follow the existing naming convention
* Do not create unnecessary folders
* Do not over-split simple single-file tasks
* Split larger structures in a logical way

File naming consistency must be preserved.

For example:

* If the project uses `camelCase`, use `camelCase`
* If the project uses `kebab-case`, use `kebab-case`
* If the project uses `PascalCase`, use `PascalCase`

---

# 7. Code Quality Rules

Code must always be readable, simple, and maintainable.

Pay attention to the following:

* Use meaningful variable names
* Functions must have a single responsibility
* Long functions should be split into logical parts when needed
* Do not add unnecessary comments
* Use explanatory comments only in complex areas
* Avoid magic numbers and magic strings
* Do not ignore error handling
* Consider edge cases
* Do not add unnecessary dependencies
* Do not leave unused imports, variables, functions, or files

Code should not be left as-is just because it works; it must also be clean and suitable for the project.

---

# 8. Do Not Break Existing Behavior

Existing working features must not be broken while making a change.

The AI agent must pay attention to the following:

* Existing API behavior must not change
* Existing component props should not be unnecessarily broken
* Existing page flows must be preserved
* Existing user experience must not be changed unintentionally
* Existing validations must not be removed
* Existing responsive behavior must be preserved

If a breaking change is required, it must be clearly stated and the reason must be explained.

---

# 9. Turkish Language and Encoding Rules

If Turkish text is used in the project, Turkish characters must always be written correctly.

## 9.1 Turkish Character Usage

Turkish characters must be used correctly:

* ğ, Ğ
* ü, Ü
* ş, Ş
* ı, İ
* ö, Ö
* ç, Ç

Incorrectly encoded characters must never be left in the codebase.

Incorrect examples:

* `Ã¶`
* `Ã¼`
* `ÅŸ`
* `Ä±`
* `ÄŸ`
* `Ã§`

Correct examples:

* `ö`
* `ü`
* `ş`
* `ı`
* `ğ`
* `ç`

---

## 9.2 Unicode Escape Usage

Unicode escape sequences must not be used in Turkish texts.

Incorrect:

```text id="dw7kg2"
\u00E7
\u011F
\u0131
\u015F
```

Correct:

```text id="lq8nra"
ç
ğ
ı
ş
```

If Turkish strings exist in the code, the characters must be written directly using the correct Turkish letters.

---

## 9.3 Correct Character Conversions

| Incorrect Unicode | Correct Character |
| ----------------- | ----------------- |
| `\u00E7`          | ç                 |
| `\u00C7`          | Ç                 |
| `\u011F`          | ğ                 |
| `\u011E`          | Ğ                 |
| `\u0131`          | ı                 |
| `\u0130`          | İ                 |
| `\u00F6`          | ö                 |
| `\u00D6`          | Ö                 |
| `\u015F`          | ş                 |
| `\u015E`          | Ş                 |
| `\u00FC`          | ü                 |
| `\u00DC`          | Ü                 |

---

## 9.4 File Encoding Rules

Files must be saved with UTF-8 encoding.

Encoding must not be broken in files that contain Turkish characters.

When saving files, use the following whenever possible:

```python id="t6bfx9"
encoding="utf-8-sig"
```

If using CLI, UTF-8 encoding must be enabled.

If using PowerShell, run:

```powershell id="m6fs2c"
chcp 65001
```

---

# 10. Terminal and CLI Rules

When reading or writing files through terminal or CLI, encoding issues must be handled carefully.

Before running a command:

* Check the file path
* Check the encoding
* Make sure Turkish characters will not be corrupted
* Understand the impact area before making bulk changes

If the CLI supports it, use:

```bash id="xk83nv"
--encoding utf-8
```

---

# 11. Refactoring Rules

Refactoring should only be done when it is truly necessary.

During refactoring:

* Existing behavior must be preserved
* Unnecessary large changes must be avoided
* The code must become more readable
* Repeated structures must be reduced
* Component and helper separation must be logical
* Testability should be improved

Do not perform large refactors purely for aesthetic reasons.

---

# 12. Bug Fixing Rules

When fixing a bug, the root cause must be understood first.

The AI agent must follow this order:

1. Analyze the bug.
2. Identify which file or function causes the issue.
3. Plan the smallest but correct change.
4. Apply the fix.
5. Add a safeguard to prevent the same issue from happening again.
6. Make sure related areas are not broken.

Fix the real cause instead of applying temporary workarounds that only hide the symptom.

---

# 13. New Feature Rules

When adding a new feature, the existing architecture must be followed.

For a new feature:

* Identify the required files
* Use existing components/helpers if possible
* Keep API, state, UI, and styling responsibilities clearly separated
* Do not add unnecessary dependencies
* Avoid code duplication
* Consider edge cases
* Do not ignore responsive and accessibility details

A new feature should look like it has always been part of the project, not like it was added afterwards.

---

# 14. Response Rules

The AI agent must give clear and actionable answers to the user.

When a code change is requested:

* Do not provide vague, fragmented explanations
* Clearly state which files need to be changed
* Provide the complete updated version of the relevant file when needed
* Prefer output that the user can directly copy and paste

If only an explanation is needed, keep it short and clear.

If there is an error, clearly state the error and provide the solution directly.

---

# 15. Things Not To Do

The AI agent must not:

* Write code without understanding the existing architecture
* Create unnecessary files or folders
* Rewrite the same component repeatedly with different names
* Break encoding
* Write Turkish characters as Unicode escape sequences
* Change existing working behavior unnecessarily
* Add unnecessary dependencies
* Leave unused imports or variables
* Perform large refactors without justification
* Break the component structure
* Pollute the system with inline styles
* Produce copy-pasted code
* Hide error messages
* Present a temporary workaround as a permanent solution
* Break the project’s naming conventions

---

# 16. Priority Order

When making decisions, the priority order is:

1. Preserve the existing working structure of the project
2. Follow the existing architecture
3. Preserve or improve code quality
4. Ensure reusability
5. Avoid unnecessary complexity
6. Preserve correct Turkish characters and encoding
7. Provide clear output that the user can directly apply

---

# 17. Final Check

After every change, the following checks must be made:

* Is the code compatible with the existing architecture?
* Is there unnecessary repetition?
* Is the component structure preserved?
* Are Turkish characters correct?
* Is the encoding preserved?
* Are there unused imports or variables?
* Is existing behavior preserved?
* Is the new structure readable and maintainable?
* Can the user use this directly?

The task is not considered complete until these checks are done.
