using ApiDemo.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiDemo.Data;

public class ApiDemoDbContext : DbContext
{
    public ApiDemoDbContext(DbContextOptions<ApiDemoDbContext> options)
        : base(options)
    {
    }

    public DbSet<Product> Products => Set<Product>();

    public DbSet<Order> Orders => Set<Order>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Product>().HasData(
            new Product
            {
                Id = 1,
                Name = "Notebook",
                Category = "electronics",
                Price = 3500.00m
            },
            new Product
            {
                Id = 2,
                Name = "Mouse",
                Category = "electronics",
                Price = 120.00m
            },
            new Product
            {
                Id = 3,
                Name = "Teclado",
                Category = "electronics",
                Price = 250.00m
            },
            new Product
            {
                Id = 4,
                Name = "Livro de Arquitetura de Software",
                Category = "books",
                Price = 180.00m
            },
            new Product
            {
                Id = 5,
                Name = "Livro de Segurança de APIs",
                Category = "books",
                Price = 150.00m
            }
        );
    }
}