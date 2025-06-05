# Contributing to Tuturuuu

We welcome contributions from the community to help strengthen our project and better serve our users. Please follow these guidelines if you wish to contribute:

## Reporting Issues

If you discover a vulnerability or other issue with our systems, please report it responsibly by following our [security policy](link). We appreciate any responsible disclosure of risks that allows us to better protect users and fix problems quickly.

For bugs, feature requests, or other non-security issues, please search our issue tracker to ensure it has not already been reported. If you find a new issue, include as much relevant information as possible to help our team diagnose and fix the problem efficiently. Be friendly and respectful in your communication with us and other contributors.

## Contributing Code

We welcome pull requests to address issues in our codebase or add useful features. Please take the time to thoroughly review our project roadmap and existing issues to find a meaningful area for contribution. Follow these steps for contributing code:

1. Fork the repository and create a branch for your contribution.

2. Install all dependencies by running:

```bash
bun install
```

3. Build the project to ensure your environment is set up properly. Run:

```bash
bun build
```

4. Add tests and documentation for your changes as appropriate. Make sure your code is clear, standards-compliant, secure, and bug-free.

5. Submit a pull request explaining your changes and referencing any relevant issues. Be open to feedback and make any requested changes.

6. Once approved and merged, you may delete your branch.

We reserve the right to not accept any contribution for any reason at our sole discretion. The decision will be based on various factors including but not limited to:

- Fit with project vision and roadmap
- Quality and security of code
- Readability and maintainability
- User experience implications
- Licensing
- Project priorities and resourcing considerations

Contributors are expected to comply with our conduct principles:

- Be welcoming, friendly, and respectful
- Be considerate, constructive, and helpful
- Be professional, ethical, and take responsibility

Thank you again for your interest in contributing to Tuturuuu! Together we can build an exceptional experience for our users.

## Local Setup

To setup Tuturuuu locally, you'll need:

- bun installed (our package manager of choice)
- A database (we recommend PostgreSQL)

Then, follow these steps:

1. Clone this repository

2. Install dependencies: `bun install`

3. Create a `.env` file with your database URL and other secrets (ask a maintainer for an example)

4. Start local supabase development: `bun supabase start`

5. Start the Next.js dev server: `bun dev`

6. Your Web Application will be running on <http://localhost:7803> and the dashboard on <http://localhost:8003>

There are 5 seed accounts that are already set up on running the local development stack (formatted as email:password):

1. <local@tuturuuu.com>:password123
2. <user1@tuturuuu.com>:password123
3. <user2@tuturuuu.com>:password123
4. <user3@tuturuuu.com>:password123
5. <user4@tuturuuu.com>:password123

Let us know if you have any other questions! We're happy to help you get started contributing.
