#!/bin/bash
# Prompt Claude to consider updating CHANGELOG.json after commits
#
# This hook runs after Bash tool calls. It detects git commits and
# provides context to help Claude decide whether to add a changelog entry.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Only trigger on git commit
if ! echo "$COMMAND" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Extract commit message (handles both -m "msg" and -m 'msg')
MSG=$(echo "$COMMAND" | grep -oE '\-m\s+["\x27][^"\x27]+["\x27]' | sed "s/-m\s*[\"']//;s/[\"']$//" || echo "")

# If no message found, try HEREDOC format
if [ -z "$MSG" ]; then
  MSG=$(echo "$COMMAND" | grep -oP '(?<=EOF\n).*(?=\nEOF)' | head -1 || echo "unknown commit")
fi

# Get affected files from staging area (last commit)
FILES=$(git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | head -20 | tr '\n' ', ' | sed 's/,$//')

# Determine likely category from conventional commit prefix
CATEGORY="unknown"
case "$MSG" in
  feat*|feature*|Feature*) CATEGORY="feat" ;;
  fix*|Fix*|bugfix*) CATEGORY="fix" ;;
  perf*|Perf*) CATEGORY="perf" ;;
  docs*|Docs*) CATEGORY="docs" ;;
  *breaking*|*BREAKING*|*Breaking*) CATEGORY="breaking" ;;
esac

# Output context for Claude
jq -n \
  --arg msg "$MSG" \
  --arg cat "$CATEGORY" \
  --arg files "$FILES" \
  '{
    "additionalContext": "A commit was just made.\n\nCommit message: \($msg)\nLikely category: \($cat)\nAffected files: \($files)\n\nConsider whether CHANGELOG.json needs an entry for this change. User-facing features, fixes, and breaking changes should be documented. Internal refactors, tests, and minor fixes can be skipped."
  }'
