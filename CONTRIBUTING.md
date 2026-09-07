# Contributing

Thanks for your interest! Here's how to get started.

## Local setup

1. Clone the repo and install dashboard dependencies:
   ```
   cd dashboard
   npm install
   npm run dev
   ```
2. For the agent, set up a Python 3.10+ venv and install requirements:
   ```
   cd agent
   python -m venv venv
   venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. For the backend, install [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) and run:
   ```bash
   cd backend
   sam build
   sam deploy --stack-name labpulse --region ap-south-1 --capabilities CAPABILITY_IAM --resolve-s3
   ```

## Pull requests

- Keep changes focused — one feature or fix per PR.
- Run `npm run lint` in the dashboard before pushing.
- Agent changes should pass `python -m pytest agent/test_agent_features.py`.
- Write clear commit messages (imperative mood, e.g. "add filter to compliance page").

## Reporting bugs

Open an issue with steps to reproduce, expected vs actual behavior, and your environment (OS, Node version, Python version).
