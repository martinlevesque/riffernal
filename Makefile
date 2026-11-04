.PHONY: build run deploy deploy-https dev dev-stop worktree clean logs backup restore

IMAGE_NAME := riffernal
CONTAINER_NAME := riffernal
PORT := 9876

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run -d \
		-p $(PORT):$(PORT) \
		-v "$(CURDIR)/data:/app/data" \
		--name $(CONTAINER_NAME) \
		$(IMAGE_NAME)

deploy: build run
	@echo "Deployed! Visit http://localhost:$(PORT)"

deploy-https: build
	docker run -d \
		-p $(PORT):$(PORT) \
		-v "$(CURDIR)/data:/app/data" \
		-v "$(CURDIR)/certs:/app/certs" \
		--name $(CONTAINER_NAME) \
		$(IMAGE_NAME) \
		bun run start
	@echo "Deployed with HTTPS! Visit https://localhost:$(PORT)"

dev:
	docker compose -f docker-compose.dev.yml up -d
	@echo "Dev server running! Visit http://localhost:$(PORT) (Ctrl+C detaches logs, make dev-stop stops it)"
	docker compose -f docker-compose.dev.yml logs -f

dev-stop:
	docker compose -f docker-compose.dev.yml down

stop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

clean: stop
	-docker rmi $(IMAGE_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)

BACKUP_FILE := backups/riffernal-$(shell date +%Y%m%d-%H%M%S).db

# Snapshot data/riffernal.db. On the VPS, run it as root from /opt/riffernal.
backup:
	@mkdir -p backups
	@bun run scripts/db-backup.ts > $(BACKUP_FILE) || { rm -f $(BACKUP_FILE); exit 1; }
	@echo "Backup written to $(BACKUP_FILE)"

# Usage: make restore FILE=backups/<name>.db (stop the local server first).
# On the VPS stop the service first: systemctl stop riffernal.
restore:
	@test -f "$(FILE)" || { echo "Usage: make $@ FILE=backups/<name>.db"; exit 1; }
	@read -p "$@: replace the database with $(FILE)? [y/N] " answer && [ "$$answer" = y ] || { echo "Aborted."; exit 1; }
	@bun run scripts/db-restore.ts < "$(FILE)"
