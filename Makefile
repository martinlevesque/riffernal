.PHONY: build run deploy deploy-https dev dev-stop clean logs backup restore

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

backup:
	bun run scripts/db-backup.ts

restore:
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make restore FILE=backups/riffernal-YYYYMMDD-HHMMSS.db"; \
		exit 1; \
	fi
	bun run scripts/db-restore.ts "$(FILE)"
