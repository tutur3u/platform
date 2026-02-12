#!/bin/bash
set -e

echo "🚀 Setting up Tuturuuu Platform development environment..."

# Install Python dependencies for Discord bot
echo "🐍 Installing Python dependencies..."
if [ -f "apps/discord/requirements.txt" ]; then
  pip install --quiet -r apps/discord/requirements.txt
  echo "✅ Python dependencies installed"
else
  echo "⚠️  apps/discord/requirements.txt not found, skipping"
fi

# Install workspace dependencies
echo "📦 Installing workspace dependencies..."
bun install

# Print environment summary
echo ""
echo "✨ Development environment ready!"
echo ""
echo "📋 Installed tools:"
echo "  • Node.js:    $(node --version)"
echo "  • Bun:        $(bun --version)"
echo "  • Python:     $(python3 --version)"
echo "  • Docker:     $(docker --version | cut -d' ' -f1-3)"
echo ""
echo "📌 Quick start commands:"
echo "  • Start all apps:         bun dev"
echo "  • Full stack (+ Supabase): bun devx"
echo "  • Run tests:              bun test"
echo "  • Type check:             bun type-check"
echo "  • Supabase local:         cd apps/database && bun sb:start"
echo ""
echo "✅ Setup complete!"
