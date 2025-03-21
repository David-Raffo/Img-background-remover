# syntax=docker/dockerfile:1
FROM python:3.13.2

# install app dependencies
COPY requirements.txt /
RUN pip install --no-cache-dir -r requirements.txt

# install app
COPY app.py /
COPY templates /templates

# final configuration
ENV FLASK_APP=hello
EXPOSE 5000
CMD ["python", "app.py"]