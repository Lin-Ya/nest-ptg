import {
  Controller,
  Get,
  Query,
  Redirect,
  Param,
  Req,
  Post,
  Body,
  Delete,
  Put,
  UseGuards,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from './user.service';
import { SessionService } from '../session/session.service';
import { Request, Response } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { IResult } from '../common/interfaces/result.interface';
import { AuthService } from '../core/auth/auth.service';
import { RolesGuard } from '../core/guards/roles.guard';
import { User } from './entity/user.entity';
import config from '../../global.config';

@Controller('api/user')
export class UserControllerApi {
  constructor(
    private readonly userService: UserService,
    private readonly sessionService: SessionService,
    private readonly authService: AuthService,
  ) {}

  @Post('login')
  public async login(@Body()
  loginData: {
    account: string;
    password: string;
  }): Promise<IResult> {
    let token;
    await this.userService.login(loginData.account, loginData.password);
    const session = await this.sessionService.find({ name: loginData.account });

    if (session) {
      token = session.token;
    } else {
      token = await this.authService.createToken({
        account: loginData.account,
      });
    }

    const user = await this.userService.findOneByAccount(loginData.account);
    const data = { ...user, token };
    return { code: 200, message: '登录成功', data };
  }

  /**
   * 用户注册
   * @param user
   */
  @Post('register')
  public async register(@Body()
  user: {
    account: string;
    password: string;
  }): Promise<IResult> {
    const result = await this.userService.register(user);
    return { code: 200, message: '注册成功', data: result };
  }

  // @Get('login/:name')
  // public async login(@Param() paramData: { name: string }): Promise<IResult> {
  //   const session = await this.sessionService.find({ name: paramData.name });
  //   const token = session.token;
  //   const user = await this.userService.findOneByName(paramData.name);
  //   const data = { ...user, token };
  //   return { code: 200, message: '登录成功', data };
  // }

  @Delete(':id')
  @Roles('admin')
  @UseGuards(AuthGuard(), RolesGuard)
  async remove(@Param() id: number): Promise<IResult> {
    const data = await this.userService.remove(id);
    return { code: 200, message: '删除用户成功', data };
  }

  @Put(':id')
  @Roles('admin')
  @UseGuards(AuthGuard(), RolesGuard)
  async update(@Param() id: number, updateInput: User): Promise<IResult> {
    const data = await this.userService.update(id, updateInput);
    return { code: 200, message: '更新用户成功', data };
  }

  @Get(':id')
  async findOne(@Param() id: number): Promise<IResult> {
    const data = await this.userService.findOneWithPostsById(id);
    return { code: 200, message: '查询用户成功', data };
  }

  @Get()
  @Roles('admin')
  @UseGuards(AuthGuard(), RolesGuard)
  async findAll(): Promise<IResult> {
    const data = await this.userService.findAll();
    return { code: 200, message: '查询所有用户成功', data };
  }

  @Post('/logged')
  public async logged(@Req() req: Request) {
    const session = await this.sessionService.find({
      token: req.cookies['ptg-token'],
    });
    if (session) {
      if (Number(session.createAt) - +new Date() > config.sessionTime) {
        return { code: 400, messsage: '登录已过期', data: null };
      }
      const user = await this.userService.findOneByAccount(session.name);
      if (user) {
        return {
          code: 200,
          message: '已经登录',
          data: { ...user, token: session.token },
        };
      } else {
        return { code: 400, message: '用户不存在', data: null };
      }
    } else {
      return { code: 400, message: '登录已过期', data: null };
    }
  }

  @Get('/oauth')
  @Redirect('/', 301)
  public async githubOauth(@Query() queryData: { code: string }) {
    const parseResult = await this.userService.assessToken(queryData);
    const parseUser = await this.userService.getGithubUserInfo(parseResult);
    const find = await this.userService.validateUser(parseUser.name);
    let user = {};

    if (!find && parseUser.name !== '') {
      user = await this.userService.register({
        login: parseUser.login,
        avatarUrl: parseUser.avatar_url,
        name: parseUser.name,
      });
    }
    const loginStatus = await this.userService.login(parseUser.name, '111111');
    await this.sessionService.create({
      token: loginStatus,
      createAt: +Date.now(),
      name: parseUser.name,
    });

    return {
      url: `${config.webUrl}/logged?name=${parseUser.name}`,
    };
  }
}
