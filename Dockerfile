# hshelf: the client is built with node, the server runs on ruby.
# `docker build --target test .` runs the server tests; the default target is
# the image that runs the server.

FROM node:24.22.1-trixie-slim AS js_builder

WORKDIR /usr/src/app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY webpack.config.js ./
COPY app/client app/client
RUN npm run build

FROM ruby:4.0.9-alpine3.24 AS base

# Alpine splits the coders out of imagemagick; PNG and GIF come with it.
# eventmachine, under thin, links against libstdc++.
RUN apk add --no-cache imagemagick imagemagick-jpeg libstdc++

# The cluster mounts config.yml at /myapp/configs, so the app stays here.
ENV APP_HOME=/myapp
WORKDIR $APP_HOME

FROM base AS bundler

RUN apk add --no-cache build-base
COPY Gemfile Gemfile.lock ./

FROM bundler AS gems

RUN bundle config set --local frozen true \
    && bundle config set --local without 'development test' \
    && bundle install --jobs 4 \
    && rm -rf /usr/local/bundle/cache

FROM bundler AS test

RUN bundle config set --local frozen true \
    && bundle install --jobs 4
COPY . .
COPY --from=js_builder /usr/src/app/dist/js dist/js
RUN bundle exec ruby test/server_test.rb

FROM base

COPY --from=gems /usr/local/bundle /usr/local/bundle
COPY . .
COPY --from=js_builder /usr/src/app/dist/js dist/js

ENV RACK_ENV=production
# The test stage has the compilers and their libraries, so a library this stage
# lacks only shows when the server starts. Loading the gems here fails the build instead.
RUN bundle exec ruby -Ilib -e 'require "thin"; require "aphrael"'
EXPOSE 9292
# The cluster runs the same command on a unix socket, with --socket in place of -a and -p.
CMD ["bundle", "exec", "thin", "-R", "config.ru", "-a", "0.0.0.0", "-p", "9292", "start"]
