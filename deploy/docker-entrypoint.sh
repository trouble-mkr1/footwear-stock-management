#!/bin/sh
set -eu

# Never create an apparently persistent directory on the container's
# temporary filesystem if the real volume was not mounted.
if [ "${NODE_ENV:-}" = "production" ]; then
    if [ -z "${IMAGE_UPLOAD_DIR:-}" ]; then
        echo >&2 "ERROR: IMAGE_UPLOAD_DIR must point to the mounted persistent image directory."
        exit 1
    fi
    case "$IMAGE_UPLOAD_DIR" in
        /*) ;;
        *) echo >&2 "ERROR: IMAGE_UPLOAD_DIR must be an absolute path."; exit 1 ;;
    esac
    if [ ! -d "$IMAGE_UPLOAD_DIR" ]; then
        echo >&2 "ERROR: Image volume directory is missing: $IMAGE_UPLOAD_DIR"
        exit 1
    fi
    if [ "$IMAGE_UPLOAD_DIR" = "/" ] || [ "$IMAGE_UPLOAD_DIR" = "/app" ] || [ "$IMAGE_UPLOAD_DIR" = "/app/public" ]; then
        echo >&2 "ERROR: Refusing an unsafe IMAGE_UPLOAD_DIR mount path."
        exit 1
    fi

    # Railway mounts volumes owned by root. Transfer only this volume's files,
    # then run the actual Node server without root privileges.
    chown -R node:node "$IMAGE_UPLOAD_DIR"
fi

exec gosu node "$@"
