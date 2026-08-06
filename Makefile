.PHONY: build run deploy deploy-https stop clean logs

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

stop:
	-docker stop $(CONTAINER_NAME)
	-docker rm $(CONTAINER_NAME)

clean: stop
	-docker rmi $(IMAGE_NAME)

logs:
	docker logs -f $(CONTAINER_NAME)
