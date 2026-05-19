---
name: Preserve existing comments when editing files
description: Never remove existing code comments when editing — only add or adjust
type: feedback
---

Always preserve existing comments when editing a file. Only add new ones or adjust wording if needed.

**Why:** User explicitly flagged that comments were removed during an edit.

**How to apply:** When writing old_string/new_string in Edit calls, carry all existing comments through unchanged unless the user asks to remove them.
