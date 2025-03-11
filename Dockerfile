FROM rust:buster AS builder-gifski
RUN cargo install --version 1.7.0 gifski

FROM gcc:13 AS builder-lottie-to-png

RUN apt-get update && apt-get install -y --no-install-recommends cmake git python3 python3-pip \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --break-system-packages conan==2.0.10 \
  && git clone --branch v1.1.1 https://github.com/ed-asriyan/lottie-converter.git /application

WORKDIR /application
RUN conan profile detect
RUN conan install . --build=missing -s build_type=Release
RUN cmake -DCMAKE_BUILD_TYPE=Release -DLOTTIE_MODULE=OFF CMakeLists.txt && cmake --build . --config Release
COPY --from=builder-gifski /usr/local/cargo/bin/gifski /usr/bin/gifski

FROM node:20

RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2  \
    libgif7  \
    libjpeg62-turbo  \
    libpango1.0-0  \
    libpixman-1-0  \
    libpng16-16  \
    librlottie0-1 \
    librsvg2-2  \
    libvips42  \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/storage /app/logs

WORKDIR /app
COPY --from=builder-gifski /usr/local/cargo/bin/gifski /usr/bin/gifski
COPY --from=builder-lottie-to-png /application/bin/lottie_to_png /usr/bin/lottie_to_png
COPY --from=builder-lottie-to-png /application/bin/lottie_common.sh /usr/bin
COPY --from=builder-lottie-to-png /application/bin/lottie_to_gif.sh /usr/bin
RUN chmod +x /usr/bin/lottie_to_png /usr/bin/lottie_common.sh /usr/bin/lottie_to_gif.sh

COPY package*.json tsconfig.json ./
COPY src/ /app/src
COPY prisma/ /app/prisma

RUN npm i --ignore-scripts \
  && npm install --ignore-scripts -g typescript ts-node \
  && npx envinfo --binaries --system --npmPackages=sharp --npmGlobalPackages=sharp \
  && npx prisma generate \
  && npx tsc

CMD [ "npm", "start" ]
