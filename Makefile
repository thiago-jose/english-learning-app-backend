build-UsersFunction:
	# Install all dependencies (including devDependencies) first
	npm ci
	# Now build the TypeScript code
	npm run build
	# Copy package files to artifacts directory
	cp package*.json $(ARTIFACTS_DIR)
	# Copy built JavaScript files to artifacts directory
	cp -r dist $(ARTIFACTS_DIR)
	# Install only production dependencies in artifacts directory
	cd $(ARTIFACTS_DIR) && npm install --production