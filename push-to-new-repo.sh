#!/bin/bash

# Script to push codebase to a new repository
# Usage: ./push-to-new-repo.sh <new-repo-url>

if [ -z "$1" ]; then
    echo "Usage: ./push-to-new-repo.sh <new-repo-url>"
    echo "Example: ./push-to-new-repo.sh https://github.com/username/new-repo.git"
    exit 1
fi

NEW_REPO_URL=$1

echo "🚀 Pushing to new repository: $NEW_REPO_URL"
echo ""

# Add new remote
echo "📦 Adding new remote as 'new-origin'..."
git remote add new-origin "$NEW_REPO_URL" 2>/dev/null || git remote set-url new-origin "$NEW_REPO_URL"

# Push all branches
echo "📤 Pushing all branches..."
git push new-origin --all

# Push all tags
echo "🏷️  Pushing all tags..."
git push new-origin --tags

echo ""
echo "✅ Successfully pushed to new repository!"
echo ""
echo "To make this the default remote, run:"
echo "  git remote remove origin"
echo "  git remote rename new-origin origin"
echo ""
echo "Or keep both remotes and push to either:"
echo "  git push origin main    # Original repo"
echo "  git push new-origin main # New repo"

