# syntax=docker/dockerfile:1.3
FROM rust:buster as builder-gifski
RUN cargo install --version 1.7.0 gifski

FROM gcc:13 as builder-lottie-to-png

# 使用 BuildKit 缓存 apt 目录
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt update && apt install --assume-yes git cmake python3 python3-pip && \
    rm -rf /var/lib/apt/lists/*
RUN pip3 install --break-system-packages conan==2.0.10
RUN git clone --branch v1.1.1 https://github.com/ed-asriyan/lottie-converter.git /application

WORKDIR /application
RUN conan profile detect
RUN conan install . --build=missing -s build_type=Release
RUN cmake -DCMAKE_BUILD_TYPE=Release -DLOTTIE_MODULE=OFF CMakeLists.txt && cmake --build . --config Release
COPY --from=builder-gifski /usr/local/cargo/bin/gifski /usr/bin/gifski

FROM node:20

# 同样缓存 apt 相关目录
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    apt update && apt-get --no-install-recommends install -y \
        libpixman-1-0 libcairo2 libpango1.0-0 libgif7 libjpeg62-turbo libpng16-16 librsvg2-2 libvips42 librlottie0-1 && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/storage /app/logs

WORKDIR /app
COPY --from=builder-gifski /usr/local/cargo/bin/gifski /usr/bin/gifski
COPY --from=builder-lottie-to-png /application/bin/lottie_to_png /usr/bin/lottie_to_png
COPY --from=builder-lottie-to-png /application/bin/lottie_common.sh /usr/bin
COPY --from=builder-lottie-to-png /application/bin/lottie_to_gif.sh /usr/bin
RUN chmod +x /usr/bin/lottie_to_png /usr/bin/lottie_common.sh /usr/bin/lottie_to_gif.sh

# 先复制 package*.json 等文件，单独执行 npm install 并使用 npm 缓存挂载
COPY package*.json tsconfig.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install

# 再复制源代码，其它步骤不会影响 npm 依赖层的缓存命中
COPY src/ /app/src
COPY prisma/ /app/prisma

RUN npm install -g typescript ts-node
RUN npx envinfo --binaries --system --npmPackages=sharp --npmGlobalPackages=sharp
RUN npx prisma generate
RUN npx tsc

CMD [ "npm", "start" ]
