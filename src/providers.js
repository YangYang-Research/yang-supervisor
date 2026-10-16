import fetch from 'node-fetch';

const PROVIDERS = {
  openai: {baseUrl: 'https://api.openai.com/v1', protocol: 'openai'},
  anthropic: {baseUrl: 'https://api.anthropic.com/v1', protocol: 'anthropic'},
  google: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    protocol: 'google'
  },
  nvidia: {baseUrl: 'https://integrate.api.nvidia.com/v1', protocol: 'openai'},
  openrouter: {baseUrl: 'https://openrouter.ai/api/v1', protocol: 'openai'},
  yangyang: {baseUrl: 'https://inference.yyng.icu/v1', protocol: 'openai'}
};

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429]);

function normalizeProvider(provider) {
  const normalized = provider.trim().toLowerCase();
  return normalized === 'nvida' ? 'nvidia' : normalized;
}

export function resolveProviderConfig({provider, apiKey}) {
  const name = normalizeProvider(provider);
  const definition = PROVIDERS[name];
  if (!definition) {
    throw new Error(
      `Unsupported PROVIDER "${provider}". Use one of: ${Object.keys(PROVIDERS).join(', ')}`
    );
  }
  if (!apiKey) {
    throw new Error(`API_KEY is required for provider "${name}"`);
  }
  return {
    name,
    protocol: definition.protocol,
    apiKey,
    baseUrl: definition.baseUrl
  };
}

function createOpenAIRequest(config, {model, temperature, maxTokens, messages, agent}) {
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'github-actions/yang-git-assistant'
  };
  if (config.apiKey && config.name === 'yangyang') {
    headers['x-yang-api-token'] = config.apiKey;
  } else if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  if (config.name === 'openrouter') {
    headers['x-openrouter-title'] = 'Yang Git Assistant';
  }

  const body = {
    model,
    messages,
    stream: false
  };
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  if (config.name === 'openai') {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }
  if (config.name === 'yangyang') {
    body.agent = agent || 'yang-git-assistant';
  }

  const path = config.name === 'yangyang' ? '/agents' : '/chat/completions';
  return {
    url: `${config.baseUrl}${path}`,
    headers,
    body
  };
}

function createAnthropicRequest(config, {model, temperature, maxTokens, messages}) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const conversation = messages.filter((message) => message.role !== 'system');
  const body = {
    model,
    system,
    messages: conversation,
    max_tokens: maxTokens
  };
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  return {
    url: `${config.baseUrl}/messages`,
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'user-agent': 'github-actions/yang-git-assistant'
    },
    body
  };
}

function createGoogleRequest(config, {model, temperature, maxTokens, messages}) {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{text: message.content}]
    }));
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens
    }
  };
  if (system) {
    body.systemInstruction = {parts: [{text: system}]};
  }
  if (temperature !== undefined) {
    body.generationConfig.temperature = temperature;
  }
  return {
    url: `${config.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
    headers: {
      'content-type': 'application/json',
      'user-agent': 'github-actions/yang-git-assistant'
    },
    body
  };
}

function createProviderRequest(config, options) {
  if (config.protocol === 'anthropic') {
    return createAnthropicRequest(config, options);
  }
  if (config.protocol === 'google') {
    return createGoogleRequest(config, options);
  }
  return createOpenAIRequest(config, options);
}

function parseProviderResponse(config, payload) {
  if (config.protocol === 'anthropic') {
    const text = (payload.content || [])
      .filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n');
    return text.trim();
  }
  if (config.protocol === 'google') {
    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('\n');
    return (text || '').trim();
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => part.text || '')
      .join('\n')
      .trim();
  }
  return '';
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUS_CODES.has(status) || status >= 500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestCompletion({
  config,
  model,
  temperature,
  maxTokens,
  messages,
  agent,
  timeoutMs = 180000,
  maxAttempts = 3,
  fetchImpl = fetch,
  onRetry = () => {}
}) {
  const request = createProviderRequest(config, {
    model,
    temperature,
    maxTokens,
    messages,
    agent
  });
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(request.url, {
        method: 'POST',
        signal: controller.signal,
        headers: request.headers,
        body: JSON.stringify(request.body)
      });
      const responseText = await response.text();
      let payload;
      try {
        payload = JSON.parse(responseText);
      } catch {
        const error = new Error(
          `${config.name} returned a non-JSON response (HTTP ${response.status})`
        );
        error.retryable = isRetryableStatus(response.status);
        throw error;
      }

      if (!response.ok) {
        const detail =
          payload?.error?.message || payload?.message || responseText.slice(0, 500);
        const error = new Error(
          `${config.name} API error (HTTP ${response.status}): ${detail}`
        );
        error.retryable = isRetryableStatus(response.status);
        throw error;
      }

      return parseProviderResponse(config, payload);
    } catch (error) {
      const isAbort = error.name === 'AbortError';
      lastError = isAbort
        ? new Error(`${config.name} request timed out after ${timeoutMs}ms`)
        : error;
      const retryable = isAbort || error.retryable || error.code === 'ECONNRESET';
      if (!retryable || attempt === maxAttempts) {
        throw lastError;
      }
      onRetry(attempt, maxAttempts, lastError);
      await sleep(attempt * 2000);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}
