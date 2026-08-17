using ApiDemo.Data;
using ApiDemo.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiDemo.Controllers;

[ApiController]
[Route("products")]
public class ProductsController : ControllerBase
{
    private readonly ApiDemoDbContext _dbContext;

    public ProductsController(ApiDemoDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<Product>>> GetAll (
        [FromQuery] int page = 1,
        [FromQuery] string? category = null)
    {
        if(page < 1)
        {
            return BadRequest(new
            {
                message = "Page must be greater than zero"
            });
        }

        var query = _dbContext.Products
            .AsNoTracking()
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(category))
        {
            query = query.Where(product =>
                product.Category.ToLower() == category.ToLower());
        }

        var products = await query.ToListAsync();

        return Ok(products);
    }


    [HttpGet("{id:int}")]
    public async Task<ActionResult<Product>> GetById(int id)
    {
        var product = await _dbContext.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(product => product.Id == id);

        if (product is null) {
            return NotFound(new
            {
                message = $"Product {id} was not found"
            });
        }

        return Ok(product);
    }
}