.PHONY: build run deploy deploy-https dev dev-stop worktree clean logs backup backup-railway restore restore-railway

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

# Usage: make worktree branch=<branch> (e.g. make worktree branch=fix/178-foo).
# Works from any directory inside the repository.
ifeq ($(origin branch),command line)
# Copy the command-line override to a plain variable; passing the target
# by name (make worktree branch=foo) would otherwise be invisible to $(BRANCH).
BRANCH := $(branch)
endif

worktree:
	@test -n "$(BRANCH)" || { echo "Usage: make worktree branch=<branch>"; exit 1; }
	@bun run scripts/worktree.ts "$(BRANCH)"

stop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

clean: stop
	-docker rmi $(IMAGE_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)

BACKUP_FILE := backups/riffernal-$(shell date +%Y%m%d-%H%M%S).db

# Local: snapshot data/riffernal.db. Railway: snapshot the linked service's volume.
backup: DB_RUN := bun run
backup-railway: DB_RUN := railway ssh -- bun run
backup backup-railway:
	@mkdir -p backups
	@$(DB_RUN) scripts/db-backup.ts > $(BACKUP_FILE) || { rm -f $(BACKUP_FILE); exit 1; }
	@echo "Backup written to $(BACKUP_FILE)"

# Usage: make restore FILE=backups/<name>.db (stop the local server first).
# The Railway server is restarted afterwards so it reopens the restored file.
restore: DB_RUN := bun run
restore: AFTER := true
restore-railway: DB_RUN := railway ssh -- bun run
restore-railway: AFTER := railway restart -y
restore restore-railway:
	@test -f "$(FILE)" || { echo "Usage: make $@ FILE=backups/<name>.db"; exit 1; }
	@read -p "$@: replace the database with $(FILE)? [y/N] " answer && [ "$$answer" = y ] || { echo "Aborted."; exit 1; }
	@$(DB_RUN) scripts/db-restore.ts < "$(FILE)"
	@$(AFTER)
