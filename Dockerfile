
FROM mrwasi/wasimdv7:latest

# Image metadata
ENV IMAGE_VERSION=7.0.2
ENV BUILD_DATE=2026-02-21
ENV FEATURES="kickall,autojoin,joinrequests,devreact"
ENV LAST_UPDATE="Secure binary build"

ENV PORT=3000

# Expose port
EXPOSE 3000


HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/ping || exit 1

CMD ["./app"]
