#!/bin/bash
# Script to push to both repositories
# Usage: ./push-both.sh [branch-name] or just ./push-both.sh (defaults to current branch)

BRANCH=${1:-$(git rev-parse --abbrev-ref HEAD)}

echo "🚀 Pushing to both repositories..."
echo "📦 Branch: $BRANCH"
echo ""

echo "1️⃣  Pushing to origin (SynthralOS-core)..."
git push origin "$BRANCH" || {
    echo "❌ Failed to push to origin"
    exit 1
}

echo ""
echo "2️⃣  Pushing to new-origin (weblisite/sos)..."
git push new-origin "$BRANCH" || {
    echo "❌ Failed to push to new-origin"
    exit 1
}

echo ""
echo "✅ Successfully pushed to both repositories!"

