using ApiDemo.Contracts.Orders;
using ApiDemo.Data;
using ApiDemo.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiDemo.Controllers;

[ApiController]
[Route("orders")]
public class OrdersController : ControllerBase
{

    private readonly ApiDemoDbContext _dbContext;

    public OrdersController(ApiDemoDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    [HttpPost]
    public async Task<ActionResult<Order>> Create(CreateOrderRequest request)
    {
        var productExists = await _dbContext.Products.AnyAsync(product => product.Id == request.ProductId);

        if (!productExists)
        {
            return BadRequest(new
            {
                message = $"Product {request.ProductId} does not exist"
            });
        }

        if (request.Quantity <= 0)
        {
            return BadRequest(new
            {
                message = "Quantity must be greater than zero"
            });
        }

        var order = new Order
        {
            ProductId = request.ProductId,
            Quantity = request.Quantity,
            Notes = request.Notes,
            CreatedAt = DateTime.UtcNow
        };

        _dbContext.Orders.Add(order);
        await _dbContext.SaveChangesAsync();

        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);

    }


    [HttpGet("{id:int}")]
    public async Task<ActionResult<Order>> GetById(int id)
    {
        var order = await _dbContext.Orders.AsNoTracking()
            .FirstOrDefaultAsync(order => order.Id == id);

        if (order == null)
        {
            return NotFound(new
            {
                message = $"Order {id} was not found"
            });
        }
        return Ok(order);
    }
}