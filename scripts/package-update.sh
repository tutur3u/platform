#!/bin/bash

# Unix shell script for updating all packages in the project

# Update root dependencies
bun update

# Update apps
cd apps
for dir in *; do
    echo "Updating apps/$dir..."
    cd "$dir"
    bun update
    cd ..
done
cd ..

# Update packages
cd packages
for dir in *; do
    echo "Updating packages/$dir..."
    cd "$dir"
    bun update
    cd ..
done
cd ..