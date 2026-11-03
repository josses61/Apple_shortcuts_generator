# Cherri Shortcut Workbench

An npm app for generating Cherri programs with a local open-source model, editing `.cherri` source, and compiling it into an unsigned Apple `.shortcut` file with the official Cherri compiler.

## Run

Requirements: Node.js 20.12 or newer, Ollama, and the Cherri CLI. The web app itself has no npm dependencies.

```sh
npm start
```

Open `http://localhost:3000`.

## Local Open-Source Model

The default provider is Ollama with Qwen2.5-Coder 3B, a small Apache-2.0 code model from [QwenLM/Qwen2.5-Coder](https://github.com/QwenLM/Qwen2.5-Coder). Install [Ollama](https://github.com/ollama/ollama). If its service is not already running, start it in one terminal:

```sh
ollama serve
```

Then download the model in another terminal:

```sh
ollama pull qwen2.5-coder:3b
```

Copy `.env.example` to `.env` if you want to configure a different model or endpoint. The app talks to Ollama at `http://127.0.0.1:11434` by default; prompts stay on your machine.

## GitHub Models (Optional)

Set a GitHub token with Models read access in `.env`, and switch `MODEL_PROVIDER` to `github`:

```sh
cp .env.example .env
# Edit .env: MODEL_PROVIDER=github and set GITHUB_TOKEN.
npm start
```

The token stays on the server and is not sent to the browser. GitHub Models calls use `GITHUB_MODELS_URL` or default to `https://models.github.ai/inference/chat/completions`. If a proxy returns a non-JSON response, switch the app back to local Ollama. Never commit your token.

## Specialist Blocks

The generator can use Cherri's built-in `runJavaScriptOnWebpage`, `base64Encode`, `base64Decode`, `makeHTML`, and `showWebpage` actions. It asks for the necessary `#include` directives and does not execute decoded content or load remote scripts.

Use **Add files** to select up to three `.cherri`, `.txt`, or `.md` examples from your computer, up to 20 KB each and 60 KB total. The browser sends their contents as untrusted style and syntax references only when you generate; the app does not save them.

## Build `.shortcut` files

Install Cherri v2.3.0 or newer from the [official releases](https://github.com/electrikmilk/cherri/releases). The app checks `CHERRI_BIN`, `~/.local/bin/cherri`, then `PATH`.

On Linux, Cherri creates an unsigned `.shortcut` file. The **Build .shortcut** action runs the compiler with `--skip-sign` and downloads the generated artifact. The `.cherri` source can be opened in Cherri's editor or VS Code extension.

Always review generated source and Shortcut actions before running them, especially if they access files, websites, or personal data.