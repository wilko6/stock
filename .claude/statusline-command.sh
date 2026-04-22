#!/bin/sh
# Claude Code status line — mirrors p10k lean prompt style
# Segments: dir | git branch | model | context% | session duration

input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
model=$(echo "$input" | jq -r '.model.display_name // ""')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
duration_ms=$(echo "$input" | jq -r '.cost.total_duration_ms // empty')

# Shorten cwd: replace $HOME with ~
home="$HOME"
short_dir="${cwd/#$home/\~}"

# Git branch (skip optional lock to avoid blocking)
git_branch=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
  git_branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
fi

# Context usage indicator
ctx_info=""
if [ -n "$used_pct" ]; then
  used_int=$(printf "%.0f" "$used_pct")
  ctx_info=" | ctx ${used_int}%"
fi

# Git segment
git_info=""
if [ -n "$git_branch" ]; then
  git_info=" | $git_branch"
fi

# Session duration (format: 1h23m or 5m12s)
duration_info=""
if [ -n "$duration_ms" ]; then
  total_sec=$((duration_ms / 1000))
  hours=$((total_sec / 3600))
  minutes=$(( (total_sec % 3600) / 60 ))
  seconds=$((total_sec % 60))
  if [ "$hours" -gt 0 ]; then
    duration_info=" | ${hours}h${minutes}m"
  else
    duration_info=" | ${minutes}m${seconds}s"
  fi
fi

printf "\033[34m%s\033[0m\033[33m%s\033[0m | \033[36m%s\033[0m\033[90m%s%s\033[0m" \
  "$short_dir" "$git_info" "$model" "$ctx_info" "$duration_info"
