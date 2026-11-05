FROM nginx:alpine
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template
COPY index.html original.mp4 update.mp4 /usr/share/nginx/html/
ENV PORT=8080
EXPOSE 8080
