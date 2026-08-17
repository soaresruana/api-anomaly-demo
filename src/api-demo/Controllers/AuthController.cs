using ApiDemo.Contracts.Auth;
using Microsoft.AspNetCore.Mvc;

namespace ApiDemo.Controllers;

[ApiController]
[Route("auth")]
public class AuthController : ControllerBase
{
    [HttpPost("login")]
    public ActionResult<LoginResponse> Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new
            {
                message = "Username and password are required."
            });
        }

        return Ok(new LoginResponse
        {
            Token = $"demo-token-{request.Username}"
        });
    }
}