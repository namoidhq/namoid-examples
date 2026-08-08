FROM python:3.13-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
# The build backend packages the flat modules listed in pyproject.toml, so they
# have to be present before the install rather than copied only into the runner.
COPY pyproject.toml namoid_mcp_auth.py demo_store.py server.py ./
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir .

FROM python:3.13-slim AS runner
WORKDIR /app

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=3005

RUN groupadd --system --gid 1001 namoid \
    && useradd --system --uid 1001 --gid namoid namoid

COPY --from=builder /opt/venv /opt/venv
COPY --chown=namoid:namoid namoid_mcp_auth.py demo_store.py server.py ./

USER namoid
EXPOSE 3005

CMD ["python", "server.py"]
