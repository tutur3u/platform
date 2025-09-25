# Tuturuuu Documentation

This directory contains the comprehensive documentation for the Tuturuuu platform, organized for easy navigation and maintenance.

## 📁 Directory Structure

```text
docs/
├── components/                    # Reusable UI components
│   ├── index.mdx                 # Components overview
│   ├── workspace-wrapper.mdx     # WorkspaceWrapper documentation
│   └── workspace-wrapper-quick-reference.mdx
├── development-tools/            # Development guides and tools
│   ├── index.mdx                 # Development tools overview
│   ├── development.mdx           # Development setup
│   ├── monorepo-architecture.mdx # Project structure
│   ├── git-conventions.mdx       # Git workflow
│   ├── local-supabase-development.mdx
│   ├── ci-cd-pipelines.mdx
│   ├── cleaning-clone.mdx
│   └── documenting.mdx
├── examples/                     # Code examples and samples
│   ├── index.mdx                 # Examples overview
│   └── components/               # Component examples
│       └── workspace-wrapper-example.tsx
├── features/                     # Feature documentation
│   ├── meet-together.mdx
│   └── user-management.mdx
├── personalization/              # Personalization features
│   ├── themes.mdx
│   └── language.mdx
├── prompt-engineering/           # AI prompt engineering
│   ├── introduction.mdx
│   └── prompt-design-strategies/
├── api-reference/                # API documentation
│   ├── introduction.mdx
│   └── endpoint/
└── experiments/                  # Experimental features
    ├── form-builder.mdx
    ├── calendar.mdx
    ├── finance.mdx
    ├── project-management.mdx
    └── ai-chat.mdx
```

## 🎯 Organization Principles

### 1. **Logical Grouping**

- **Get Started**: Introduction and quick start
- **Development Tools**: Everything needed for development
- **Components**: Reusable UI components and utilities
- **Examples**: Practical code samples
- **Features**: Platform features and capabilities
- **AI Features**: AI-specific functionality
- **Personalization**: User customization options
- **API References**: API documentation
- **Experiments**: Experimental and beta features
- **Prompt Engineering**: AI prompt design strategies

### 2. **Hierarchical Structure**

- Each section has an `index.mdx` file for overview
- Related documentation is grouped together
- Clear navigation paths between related topics

### 3. **Consistent Naming**

- Files use kebab-case (`workspace-wrapper.mdx`)
- Directories use kebab-case (`development-tools/`)
- Index files are always `index.mdx`

## 📝 Documentation Standards

### File Structure

Each documentation file should include:

```mdx
---
title: "Page Title"
description: "Brief description of the page content"
updatedAt: "YYYY-MM-DD"
---

# Page Title

Content goes here...
```

### Code Examples

- Use proper syntax highlighting
- Include TypeScript types
- Show both server and client examples
- Include error handling

### Cross-References

- Link to related documentation
- Use relative paths for internal links
- Include "See also" sections

## 🔧 Maintenance

### Adding New Documentation

1. **Choose the right section** based on content type
2. **Create the file** with proper frontmatter
3. **Update the index** file in the section
4. **Add to navigation** in `mint.json`
5. **Cross-reference** from related pages

### Updating Existing Documentation

1. **Update the `updatedAt`** field
2. **Check cross-references** still work
3. **Update examples** if APIs change
4. **Test code samples** still work

### File Naming Conventions

- **Components**: `component-name.mdx`
- **Features**: `feature-name.mdx`
- **Tools**: `tool-name.mdx`
- **Examples**: `example-name.mdx`
- **Index files**: Always `index.mdx`

## 🚀 Getting Started

### For Contributors

1. Read the [Development Tools](../development-tools) section
2. Check existing documentation before creating new
3. Follow the established patterns
4. Update this README if adding new sections

### For Users

1. Start with [Introduction](./introduction)
2. Follow the [Development Tools](../development-tools) for setup
3. Check [Components](../components) for reusable components
4. Look at [Examples](../examples) for implementation patterns

## 📊 Documentation Metrics

- **Total Pages**: ~25 documentation pages
- **Code Examples**: 10+ practical examples
- **Components**: 1 documented component (WorkspaceWrapper)
- **Features**: 2 documented features
- **Last Updated**: 2024-12-19

## 🤝 Contributing

When contributing to documentation:

1. **Follow the structure** outlined above
2. **Use consistent formatting** and naming
3. **Include practical examples** with real code
4. **Test all code samples** before committing
5. **Update cross-references** when moving content
6. **Keep the README updated** with any structural changes

## 📚 Resources

- [Mintlify Documentation](https://mintlify.com/docs) - Documentation platform
- [MDX Guide](https://mdxjs.com/) - Markdown with JSX
- [TypeScript Documentation](https://www.typescriptlang.org/docs/) - TypeScript reference
