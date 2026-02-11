FROM gradle:8.12-jdk21 AS builder

WORKDIR /app
COPY build.gradle settings.gradle ./
COPY src/ src/

RUN gradle shadowJar --no-daemon

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app
COPY --from=builder /app/build/libs/app.jar app.jar

EXPOSE 3000

CMD ["java", "-jar", "app.jar"]
