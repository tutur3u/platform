#!/bin/bash
set -e

echo "🚀 Setting up Tuturuuu Platform development environment..."

# Flutter SDK installation
FLUTTER_VERSION="3.38.0"
FLUTTER_DIR="/home/vscode/flutter"

if [ ! -d "$FLUTTER_DIR" ]; then
  echo "📦 Installing Flutter SDK ${FLUTTER_VERSION}..."
  cd /home/vscode
  wget -q https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz
  tar xf flutter_linux_${FLUTTER_VERSION}-stable.tar.xz
  rm flutter_linux_${FLUTTER_VERSION}-stable.tar.xz
  
  echo "🔧 Configuring Flutter..."
  $FLUTTER_DIR/bin/flutter config --no-analytics
  $FLUTTER_DIR/bin/flutter precache
else
  echo "✅ Flutter SDK already installed"
fi

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
echo "  • Rust:       $(rustc --version | cut -d' ' -f1-2)"
echo "  • Flutter:    $(flutter --version | head -n 1)"
echo "  • Docker:     $(docker --version | cut -d' ' -f1-3)"
echo ""
echo "🩺 Running Flutter doctor..."
flutter doctor
echo ""
echo "📌 Quick start commands:"
echo "  • Start all apps:         bun dev"
echo "  • Full stack (+ Supabase): bun devx"
echo "  • Run tests:              bun test"
echo "  • Type check:             bun type-check"
echo "  • Supabase local:         cd apps/database && bun sb:start"
echo "  • Flutter mobile:         cd apps/mobile && flutter run"
echo ""
echo "✅ Setup complete!"
