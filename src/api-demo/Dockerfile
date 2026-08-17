FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build

WORKDIR /src

COPY ApiDemo.csproj ./

RUN dotnet restore ApiDemo.csproj

COPY . .

RUN dotnet publish ApiDemo.csproj \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false


FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime

WORKDIR /app

COPY --from=build /app/publish .

RUN mkdir -p /app/data

ENV ASPNETCORE_URLS=http://+:8080

EXPOSE 8080

ENTRYPOINT ["dotnet", "ApiDemo.dll"]