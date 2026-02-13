FROM alpine:3.21.3
RUN mkdir /app
WORKDIR /app
EXPOSE 8000
RUN apk add nodejs npm
